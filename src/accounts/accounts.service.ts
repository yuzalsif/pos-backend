import { Injectable, ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { CreateAccountDto, DepositDto, WithdrawDto, TransferDto } from './dto/account.dto';

@Injectable()
export class AccountsService {
    constructor(private readonly db: any, private readonly logs: any) { }

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
        const res = await this.db.partitionedFind(tenantId, { selector: {} });
        return res.docs;
    }

    async deposit(tenantId: string, actorId: string, accountId: string, dto: DepositDto) {
        const account = await this.get(tenantId, accountId);
        account.balance += dto.amount;
        account.updatedBy = actorId;
        account.updatedAt = new Date().toISOString();
        await this.db.insert(account);
        await this.logs.record(tenantId, { userId: actorId }, 'account.deposit', 'account', account._id, dto);
        return account;
    }

    async withdraw(tenantId: string, actorId: string, accountId: string, dto: WithdrawDto) {
        const account = await this.get(tenantId, accountId);
        if (account.balance < dto.amount) throw new BadRequestException('account.withdraw.insufficient_funds');
        account.balance -= dto.amount;
        account.updatedBy = actorId;
        account.updatedAt = new Date().toISOString();
        await this.db.insert(account);
        await this.logs.record(tenantId, { userId: actorId }, 'account.withdraw', 'account', account._id, dto);
        return account;
    }

    async transfer(tenantId: string, actorId: string, dto: TransferDto) {
        const { fromAccountId, toAccountId, amount, categoryId } = dto;
        const from = await this.get(tenantId, fromAccountId);
        const to = await this.get(tenantId, toAccountId);
        if (!from || !to) throw new NotFoundException('account.not_found');
        if (from.currency !== to.currency) throw new BadRequestException('account.transfer.currency_mismatch');
        if (from.balance < amount) throw new BadRequestException('account.transfer.insufficient_funds');
        // Atomic transfer: deduct, then credit, rollback if credit fails
        from.balance -= amount;
        from.updatedBy = actorId;
        from.updatedAt = new Date().toISOString();
        try {
            await this.db.insert(from);
            to.balance += amount;
            to.updatedBy = actorId;
            to.updatedAt = new Date().toISOString();
            await this.db.insert(to);
        } catch (err) {
            // Rollback deduction
            from.balance += amount;
            await this.db.insert(from);
            throw new BadRequestException('account.transfer.failed');
        }
        await this.logs.record(tenantId, { userId: actorId }, 'account.transfer', 'account', `${from._id}->${to._id}`, { fromAccountId, toAccountId, amount, categoryId });
        return { from, to };
    }
}
