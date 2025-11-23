import { Injectable, ConflictException, BadRequestException, NotFoundException, InternalServerErrorException, Inject } from '@nestjs/common';
import type nano from 'nano';
import { DATABASE_CONNECTION } from '../database/database.constants';
import { LogsService } from '../logs/logs.service';
import { CreateAccountDto, DepositDto, WithdrawDto, TransferDto } from './dto/account.dto';

@Injectable()
export class AccountsService {
    constructor(
        @Inject(DATABASE_CONNECTION) private readonly db: nano.DocumentScope<any>,
        private readonly logs: LogsService,
    ) { }

    async create(tenantId: string, actorId: string, dto: CreateAccountDto) {
        const { name, initialBalance, type, currency } = dto;
        if (initialBalance < 0) throw new BadRequestException('account.create.negative_initial_balance');
        const existing = await this.db.partitionedFind(tenantId, { selector: { name, type, currency } });
        if (existing.docs.length > 0) throw new ConflictException('account.create.duplicate');
        const now = new Date().toISOString();
        const account = {
            _id: `${tenantId}:account:${name}`,
            name,
            balance: initialBalance,
            type,
            currency,
            createdBy: actorId,
            updatedBy: actorId,
            createdAt: now,
            updatedAt: now,
        };
        await this.db.insert(account);
        await this.logs.record(tenantId, { userId: actorId }, 'account.create', 'account', account._id, { name });
        return account;
    }

    async get(tenantId: string, accountId: string) {
        try {
            return await this.db.get(`${tenantId}:account:${accountId}`);
        } catch (err) {
            if (err.statusCode === 404) throw new NotFoundException('account.not_found');
            throw err;
        }
    }

    async list(tenantId: string) {
        try {
            const res = await this.db.partitionedFind(tenantId, { selector: {} });
            return res.docs;
        } catch (err) {
            throw new InternalServerErrorException('account.list.failed');
        }
    }

    async deposit(tenantId: string, actorId: string, accountId: string, dto: DepositDto) {
        if (!dto.categoryId) throw new BadRequestException('account.category_required');

        // Validate category exists and is income type
        await this.validateCategory(tenantId, dto.categoryId, 'income');

        const account = await this.get(tenantId, accountId);
        const now = new Date().toISOString();
        account.balance += dto.amount;
        account.updatedBy = actorId;
        account.updatedAt = now;
        await this.db.insert(account);

        // Create transaction record
        const transaction = await this.createTransaction(tenantId, actorId, {
            type: 'deposit',
            accountId: account._id,
            amount: dto.amount,
            categoryId: dto.categoryId,
            currency: account.currency,
            balanceAfter: account.balance,
            timestamp: now,
        });

        await this.logs.record(tenantId, { userId: actorId }, 'account.deposit', 'account', account._id, dto);
        return { account, transaction };
    }

    async withdraw(tenantId: string, actorId: string, accountId: string, dto: WithdrawDto) {
        if (!dto.categoryId) throw new BadRequestException('account.category_required');

        // Validate category exists and is expense type
        await this.validateCategory(tenantId, dto.categoryId, 'expense');

        const account = await this.get(tenantId, accountId);
        if (account.balance < dto.amount) throw new BadRequestException('account.withdraw.insufficient_funds');
        const now = new Date().toISOString();
        account.balance -= dto.amount;
        account.updatedBy = actorId;
        account.updatedAt = now;
        await this.db.insert(account);

        // Create transaction record
        const transaction = await this.createTransaction(tenantId, actorId, {
            type: 'withdraw',
            accountId: account._id,
            amount: dto.amount,
            categoryId: dto.categoryId,
            currency: account.currency,
            balanceAfter: account.balance,
            timestamp: now,
        });

        await this.logs.record(tenantId, { userId: actorId }, 'account.withdraw', 'account', account._id, dto);
        return { account, transaction };
    }

    async transfer(tenantId: string, actorId: string, dto: TransferDto) {
        const { fromAccountId, toAccountId, amount, categoryId } = dto;
        if (!categoryId) throw new BadRequestException('account.category_required');

        // Validate category exists (transfer can use either income or expense category depending on context)
        await this.validateCategory(tenantId, categoryId);

        const from = await this.get(tenantId, fromAccountId);
        const to = await this.get(tenantId, toAccountId);
        if (!from || !to) throw new NotFoundException('account.not_found');
        if (from.currency !== to.currency) throw new BadRequestException('account.transfer.currency_mismatch');
        if (from.balance < amount) throw new BadRequestException('account.transfer.insufficient_funds');
        const now = new Date().toISOString();
        const transferId = `transfer-${Date.now()}`;

        // Store original balances for rollback
        const originalFromBalance = from.balance;
        const originalToBalance = to.balance;

        // Atomic transfer: deduct, then credit, rollback if any step fails
        from.balance -= amount;
        from.updatedBy = actorId;
        from.updatedAt = now;

        let fromTransaction: any = null;
        let toTransaction: any = null;

        try {
            await this.db.insert(from);

            // Add amount to destination account
            to.balance += amount;
            to.updatedBy = actorId;
            to.updatedAt = now;
            await this.db.insert(to);

            // Create transaction records for both accounts
            fromTransaction = await this.createTransaction(tenantId, actorId, {
                type: 'transfer_out',
                accountId: from._id,
                amount: amount,
                categoryId: categoryId,
                currency: from.currency,
                balanceAfter: from.balance,
                timestamp: now,
                relatedAccountId: to._id,
                transferId,
            });

            toTransaction = await this.createTransaction(tenantId, actorId, {
                type: 'transfer_in',
                accountId: to._id,
                amount: amount,
                categoryId: categoryId,
                currency: to.currency,
                balanceAfter: to.balance,
                timestamp: now,
                relatedAccountId: from._id,
                transferId,
            });

            await this.logs.record(tenantId, { userId: actorId }, 'account.transfer', 'account', `${from._id}->${to._id}`, { fromAccountId, toAccountId, amount, categoryId });
            return { from, to, transactions: [fromTransaction, toTransaction] };
        } catch (err) {
            // Rollback: restore original balances and delete any created transactions
            from.balance = originalFromBalance;
            from.updatedAt = new Date().toISOString();
            await this.db.insert(from);

            // If 'to' account was updated, rollback its balance too
            if (to.balance !== originalToBalance) {
                to.balance = originalToBalance;
                to.updatedAt = new Date().toISOString();
                await this.db.insert(to);
            }

            // Delete any transactions that were created
            if (fromTransaction && fromTransaction._id) {
                try {
                    const doc = await this.db.get(fromTransaction._id);
                    await this.db.destroy(doc._id, doc._rev);
                } catch (deleteErr) {
                    // Transaction might not exist, ignore error
                }
            }
            if (toTransaction && toTransaction._id) {
                try {
                    const doc = await this.db.get(toTransaction._id);
                    await this.db.destroy(doc._id, doc._rev);
                } catch (deleteErr) {
                    // Transaction might not exist, ignore error
                }
            }

            throw new BadRequestException('account.transfer.failed');
        }
    }

    private async createTransaction(tenantId: string, actorId: string, data: any) {
        const transaction = {
            _id: `${tenantId}:transaction:${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: data.type,
            accountId: data.accountId,
            amount: data.amount,
            categoryId: data.categoryId,
            currency: data.currency,
            balanceAfter: data.balanceAfter,
            timestamp: data.timestamp,
            relatedAccountId: data.relatedAccountId,
            transferId: data.transferId,
            createdBy: actorId,
            createdAt: data.timestamp,
        };
        await this.db.insert(transaction);
        return transaction;
    }

    private async validateCategory(tenantId: string, categoryId: string, expectedType?: 'income' | 'expense') {
        try {
            const id = categoryId.includes(':') ? categoryId : `${tenantId}:category:${categoryId}`;
            const category = await this.db.get(id);

            if (!category || !category._id.includes(':category:')) {
                throw new NotFoundException('account.category_invalid');
            }

            if (expectedType && category.type !== expectedType) {
                throw new BadRequestException(`account.category_type_mismatch`);
            }

            return category;
        } catch (err) {
            if (err.statusCode === 404) throw new NotFoundException('account.category_invalid');
            throw err;
        }
    }

    async getTransactions(tenantId: string, filters?: {
        accountId?: string;
        categoryId?: string;
        type?: 'deposit' | 'withdraw' | 'transfer_in' | 'transfer_out';
        startDate?: string;
        endDate?: string;
    }) {
        try {
            const selector: any = {};

            // Filter by account
            if (filters?.accountId) {
                selector.accountId = `${tenantId}:account:${filters.accountId}`;
            }

            // Filter by category
            if (filters?.categoryId) {
                const categoryFullId = filters.categoryId.includes(':')
                    ? filters.categoryId
                    : `${tenantId}:category:${filters.categoryId}`;
                selector.categoryId = categoryFullId;
            }

            // Filter by transaction type
            if (filters?.type) {
                selector.type = filters.type;
            }

            // Filter by date range
            if (filters?.startDate || filters?.endDate) {
                selector.timestamp = {};
                if (filters.startDate) {
                    selector.timestamp.$gte = filters.startDate;
                }
                if (filters.endDate) {
                    selector.timestamp.$lte = filters.endDate;
                }
            }

            const res = await this.db.partitionedFind(tenantId, {
                selector,
                sort: [{ timestamp: 'desc' }]
            });
            return res.docs.filter((doc: any) => doc._id.includes(':transaction:'));
        } catch (err) {
            throw new InternalServerErrorException('account.transactions.query_failed');
        }
    }
}
