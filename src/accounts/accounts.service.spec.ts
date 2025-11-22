import { ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { AccountsService } from './accounts.service';

describe('AccountsService (unit)', () => {
    let accountsService: AccountsService;
    const mockDb: any = {
        partitionedFind: jest.fn(),
        get: jest.fn(),
        insert: jest.fn(),
        destroy: jest.fn(),
    };
    const mockLogs: any = { record: jest.fn() };

    beforeEach(() => {
        mockDb.partitionedFind.mockReset();
        mockDb.get.mockReset();
        mockDb.insert.mockReset();
        mockDb.destroy.mockReset();
        mockLogs.record.mockReset();
        accountsService = new AccountsService(mockDb as any, mockLogs as any);
    });

    it('should create account with initial balance and log', async () => {
        // mock no duplicate
        mockDb.partitionedFind.mockResolvedValue({ docs: [] });
        mockDb.insert.mockResolvedValue({ id: 'tenant1:account:abc', rev: '1-0' });
        const dto = { name: 'NMB', initialBalance: 10000, type: 'bank', currency: 'TZS' };
        const res = await accountsService.create('tenant1', 'user:1', dto);
        expect(mockDb.insert).toHaveBeenCalled();
        expect(res.balance).toBe(10000);
        expect(res.name).toBe('NMB');
        expect(res.createdAt).toBeDefined();
        expect(res.updatedAt).toBeDefined();
        expect(mockLogs.record).toHaveBeenCalledWith('tenant1', { userId: 'user:1' }, 'account.create', 'account', expect.any(String), { name: 'NMB' });
    });

    it('should not create account with duplicate name', async () => {
        mockDb.partitionedFind.mockResolvedValue({ docs: [{ _id: 'tenant1:account:xyz', name: 'NMB' }] });
        const dto = { name: 'NMB', initialBalance: 10000, type: 'bank', currency: 'TZS' };
        await expect(accountsService.create('tenant1', 'user:1', dto)).rejects.toThrow(ConflictException);
        await expect(accountsService.create('tenant1', 'user:1', dto)).rejects.toThrow('account.create.duplicate');
    });

    it('should not create account with negative initial balance', async () => {
        mockDb.partitionedFind.mockResolvedValue({ docs: [] });
        const dto = { name: 'CRDB', initialBalance: -500, type: 'bank', currency: 'TZS' };
        await expect(accountsService.create('tenant1', 'user:1', dto)).rejects.toThrow(BadRequestException);
        await expect(accountsService.create('tenant1', 'user:1', dto)).rejects.toThrow('account.create.negative_initial_balance');
    });

    it('should get account by id', async () => {
        mockDb.get.mockResolvedValue({ _id: 'tenant1:account:abc', name: 'NMB', balance: 10000 });
        const res = await accountsService.get('tenant1', 'abc');
        expect(res.name).toBe('NMB');
        expect(res.balance).toBe(10000);
    });

    it('should throw NotFoundException if account not found', async () => {
        mockDb.get.mockRejectedValue({ statusCode: 404 });
        await expect(accountsService.get('tenant1', 'missing')).rejects.toThrow(NotFoundException);
        await expect(accountsService.get('tenant1', 'missing')).rejects.toThrow('account.not_found');
    });

    it('should list accounts', async () => {
        const docs = [{ _id: 'tenant1:account:1', name: 'NMB' }, { _id: 'tenant1:account:2', name: 'CRDB' }];
        mockDb.partitionedFind.mockResolvedValue({ docs });
        const res = await accountsService.list('tenant1');
        expect(res).toEqual(docs);
    });

    it('should deposit money and update balance, log', async () => {
        const account = { _id: 'tenant1:account:abc', name: 'NMB', balance: 10000, currency: 'TZS' };
        const category = { _id: 'tenant1:category:cat1', name: 'Sales', type: 'income' };
        mockDb.get.mockImplementation((id: string) => {
            if (id.includes(':account:')) return Promise.resolve(account);
            if (id.includes(':category:')) return Promise.resolve(category);
            return Promise.reject({ statusCode: 404 });
        });
        mockDb.insert.mockResolvedValue({ id: account._id, rev: '2-0' });
        const dto = { amount: 5000, categoryId: 'cat1' };
        const res = await accountsService.deposit('tenant1', 'user:1', 'abc', dto);
        expect(mockDb.insert).toHaveBeenCalledTimes(2); // account + transaction
        expect(res.account.balance).toBe(15000);
        expect(res.account.updatedAt).toBeDefined();
        expect(res.transaction).toBeDefined();
        expect(res.transaction.type).toBe('deposit');
        expect(res.transaction.amount).toBe(5000);
        expect(res.transaction.categoryId).toBe('cat1');
        expect(mockLogs.record).toHaveBeenCalledWith('tenant1', { userId: 'user:1' }, 'account.deposit', 'account', account._id, dto);
    });

    it('should not deposit without category', async () => {
        const dto = { amount: 5000, categoryId: '' };
        await expect(accountsService.deposit('tenant1', 'user:1', 'abc', dto)).rejects.toThrow(BadRequestException);
        await expect(accountsService.deposit('tenant1', 'user:1', 'abc', dto)).rejects.toThrow('account.category_required');
    });

    it('should not deposit with invalid category', async () => {
        const account = { _id: 'tenant1:account:abc', name: 'NMB', balance: 10000, currency: 'TZS' };
        mockDb.get.mockImplementation((id: string) => {
            if (id.includes(':account:')) return Promise.resolve(account);
            if (id.includes(':category:')) return Promise.reject({ statusCode: 404 });
            return Promise.reject({ statusCode: 404 });
        });
        const dto = { amount: 5000, categoryId: 'invalid' };
        await expect(accountsService.deposit('tenant1', 'user:1', 'abc', dto)).rejects.toThrow(NotFoundException);
        await expect(accountsService.deposit('tenant1', 'user:1', 'abc', dto)).rejects.toThrow('account.category_invalid');
    });

    it('should not deposit with expense category', async () => {
        const account = { _id: 'tenant1:account:abc', name: 'NMB', balance: 10000, currency: 'TZS' };
        const category = { _id: 'tenant1:category:cat1', name: 'Rent', type: 'expense' };
        mockDb.get.mockImplementation((id: string) => {
            if (id.includes(':account:')) return Promise.resolve(account);
            if (id.includes(':category:')) return Promise.resolve(category);
            return Promise.reject({ statusCode: 404 });
        });
        const dto = { amount: 5000, categoryId: 'cat1' };
        await expect(accountsService.deposit('tenant1', 'user:1', 'abc', dto)).rejects.toThrow(BadRequestException);
        await expect(accountsService.deposit('tenant1', 'user:1', 'abc', dto)).rejects.toThrow('account.category_type_mismatch');
    });

    it('should withdraw money and update balance, log', async () => {
        const account = { _id: 'tenant1:account:abc', name: 'NMB', balance: 10000, currency: 'TZS' };
        const category = { _id: 'tenant1:category:cat2', name: 'Rent', type: 'expense' };
        mockDb.get.mockImplementation((id: string) => {
            if (id.includes(':account:')) return Promise.resolve(account);
            if (id.includes(':category:')) return Promise.resolve(category);
            return Promise.reject({ statusCode: 404 });
        });
        mockDb.insert.mockResolvedValue({ id: account._id, rev: '2-0' });
        const dto = { amount: 4000, categoryId: 'cat2' };
        const res = await accountsService.withdraw('tenant1', 'user:1', 'abc', dto);
        expect(mockDb.insert).toHaveBeenCalledTimes(2); // account + transaction
        expect(res.account.balance).toBe(6000);
        expect(res.account.updatedAt).toBeDefined();
        expect(res.transaction).toBeDefined();
        expect(res.transaction.type).toBe('withdraw');
        expect(res.transaction.amount).toBe(4000);
        expect(res.transaction.categoryId).toBe('cat2');
        expect(mockLogs.record).toHaveBeenCalledWith('tenant1', { userId: 'user:1' }, 'account.withdraw', 'account', account._id, dto);
    });

    it('should not withdraw without category', async () => {
        const dto = { amount: 4000, categoryId: '' };
        await expect(accountsService.withdraw('tenant1', 'user:1', 'abc', dto)).rejects.toThrow(BadRequestException);
        await expect(accountsService.withdraw('tenant1', 'user:1', 'abc', dto)).rejects.toThrow('account.category_required');
    });

    it('should not withdraw with invalid category', async () => {
        const account = { _id: 'tenant1:account:abc', name: 'NMB', balance: 10000, currency: 'TZS' };
        mockDb.get.mockImplementation((id: string) => {
            if (id.includes(':account:')) return Promise.resolve(account);
            if (id.includes(':category:')) return Promise.reject({ statusCode: 404 });
            return Promise.reject({ statusCode: 404 });
        });
        const dto = { amount: 4000, categoryId: 'invalid' };
        await expect(accountsService.withdraw('tenant1', 'user:1', 'abc', dto)).rejects.toThrow(NotFoundException);
        await expect(accountsService.withdraw('tenant1', 'user:1', 'abc', dto)).rejects.toThrow('account.category_invalid');
    });

    it('should not withdraw with income category', async () => {
        const account = { _id: 'tenant1:account:abc', name: 'NMB', balance: 10000, currency: 'TZS' };
        const category = { _id: 'tenant1:category:cat2', name: 'Sales', type: 'income' };
        mockDb.get.mockImplementation((id: string) => {
            if (id.includes(':account:')) return Promise.resolve(account);
            if (id.includes(':category:')) return Promise.resolve(category);
            return Promise.reject({ statusCode: 404 });
        });
        const dto = { amount: 4000, categoryId: 'cat2' };
        await expect(accountsService.withdraw('tenant1', 'user:1', 'abc', dto)).rejects.toThrow(BadRequestException);
        await expect(accountsService.withdraw('tenant1', 'user:1', 'abc', dto)).rejects.toThrow('account.category_type_mismatch');
    });

    it('should not withdraw more than balance', async () => {
        const account = { _id: 'tenant1:account:abc', name: 'NMB', balance: 1000, currency: 'TZS' };
        const category = { _id: 'tenant1:category:cat2', name: 'Office', type: 'expense' };
        mockDb.get.mockImplementation((id: string) => {
            if (id.includes(':account:')) return Promise.resolve(account);
            if (id.includes(':category:')) return Promise.resolve(category);
            return Promise.reject({ statusCode: 404 });
        });
        const dto = { amount: 2000, categoryId: 'cat2' };
        await expect(accountsService.withdraw('tenant1', 'user:1', 'abc', dto)).rejects.toThrow(BadRequestException);
        await expect(accountsService.withdraw('tenant1', 'user:1', 'abc', dto)).rejects.toThrow('account.withdraw.insufficient_funds');
    });

    // --- Transfer scenarios ---
    it('should transfer money atomically between accounts and log', async () => {
        const fromAccount = { _id: 'tenant1:account:abc', name: 'NMB', balance: 10000, currency: 'TZS' };
        const toAccount = { _id: 'tenant1:account:def', name: 'CRDB', balance: 5000, currency: 'TZS' };
        const category = { _id: 'tenant1:category:cat3', name: 'Transfer', type: 'expense' };
        mockDb.get.mockImplementation((id: string) => {
            if (id.endsWith('abc')) return Promise.resolve(fromAccount);
            if (id.endsWith('def')) return Promise.resolve(toAccount);
            if (id.includes(':category:')) return Promise.resolve(category);
            return Promise.reject({ statusCode: 404 });
        });
        mockDb.insert.mockResolvedValue({ id: 'any', rev: '2-0' });
        const dto = { fromAccountId: 'abc', toAccountId: 'def', amount: 3000, categoryId: 'cat3' };
        const res = await accountsService.transfer('tenant1', 'user:1', dto);
        expect(mockDb.insert).toHaveBeenCalledTimes(4); // 2 accounts + 2 transactions
        expect(res.from.balance).toBe(7000);
        expect(res.to.balance).toBe(8000);
        expect(res.from.updatedAt).toBeDefined();
        expect(res.to.updatedAt).toBeDefined();
        expect(res.transactions).toHaveLength(2);
        expect(res.transactions[0].type).toBe('transfer_out');
        expect(res.transactions[1].type).toBe('transfer_in');
        expect(res.transactions[0].categoryId).toBe('cat3');
        expect(mockLogs.record).toHaveBeenCalledWith('tenant1', { userId: 'user:1' }, 'account.transfer', 'account', expect.any(String), dto);
    });

    it('should not transfer without category', async () => {
        const dto = { fromAccountId: 'abc', toAccountId: 'def', amount: 3000, categoryId: '' };
        await expect(accountsService.transfer('tenant1', 'user:1', dto)).rejects.toThrow(BadRequestException);
        await expect(accountsService.transfer('tenant1', 'user:1', dto)).rejects.toThrow('account.category_required');
    });

    it('should not transfer with invalid category', async () => {
        mockDb.get.mockImplementation((id: string) => {
            if (id.includes(':category:')) return Promise.reject({ statusCode: 404 });
            return Promise.reject({ statusCode: 404 });
        });
        const dto = { fromAccountId: 'abc', toAccountId: 'def', amount: 3000, categoryId: 'invalid' };
        await expect(accountsService.transfer('tenant1', 'user:1', dto)).rejects.toThrow(NotFoundException);
        await expect(accountsService.transfer('tenant1', 'user:1', dto)).rejects.toThrow('account.category_invalid');
    });

    it('should not transfer if currencies do not match', async () => {
        const fromAccount = { _id: 'tenant1:account:abc', name: 'NMB', balance: 10000, currency: 'TZS' };
        const toAccount = { _id: 'tenant1:account:def', name: 'KCB', balance: 5000, currency: 'KES' };
        const category = { _id: 'tenant1:category:cat3', name: 'Transfer', type: 'expense' };
        mockDb.get.mockImplementation((id: string) => {
            if (id.endsWith('abc')) return Promise.resolve(fromAccount);
            if (id.endsWith('def')) return Promise.resolve(toAccount);
            if (id.includes(':category:')) return Promise.resolve(category);
            return Promise.reject({ statusCode: 404 });
        });
        const dto = { fromAccountId: 'abc', toAccountId: 'def', amount: 1000, categoryId: 'cat3' };
        await expect(accountsService.transfer('tenant1', 'user:1', dto)).rejects.toThrow(BadRequestException);
        await expect(accountsService.transfer('tenant1', 'user:1', dto)).rejects.toThrow('account.transfer.currency_mismatch');
    });

    it('should not transfer more than available in from account', async () => {
        const fromAccount = { _id: 'tenant1:account:abc', name: 'NMB', balance: 500, currency: 'TZS' };
        const toAccount = { _id: 'tenant1:account:def', name: 'CRDB', balance: 5000, currency: 'TZS' };
        const category = { _id: 'tenant1:category:cat3', name: 'Transfer', type: 'expense' };
        mockDb.get.mockImplementation((id: string) => {
            if (id.endsWith('abc')) return Promise.resolve(fromAccount);
            if (id.endsWith('def')) return Promise.resolve(toAccount);
            if (id.includes(':category:')) return Promise.resolve(category);
            return Promise.reject({ statusCode: 404 });
        });
        const dto = { fromAccountId: 'abc', toAccountId: 'def', amount: 1000, categoryId: 'cat3' };
        await expect(accountsService.transfer('tenant1', 'user:1', dto)).rejects.toThrow(BadRequestException);
        await expect(accountsService.transfer('tenant1', 'user:1', dto)).rejects.toThrow('account.transfer.insufficient_funds');
    });

    it('should not transfer if either account does not exist', async () => {
        const category = { _id: 'tenant1:category:cat3', name: 'Transfer', type: 'expense' };
        mockDb.get.mockImplementation((id: string) => {
            if (id.includes(':category:')) return Promise.resolve(category);
            return Promise.reject({ statusCode: 404 });
        });
        const dto = { fromAccountId: 'abc', toAccountId: 'def', amount: 1000, categoryId: 'cat3' };
        await expect(accountsService.transfer('tenant1', 'user:1', dto)).rejects.toThrow(NotFoundException);
        await expect(accountsService.transfer('tenant1', 'user:1', dto)).rejects.toThrow('account.not_found');
    });

    it('should rollback transfer if credit to B fails after deduction from A', async () => {
        // Simulate deduction from A succeeds, but credit to B fails
        const fromAccount = { _id: 'tenant1:account:abc', name: 'NMB', balance: 10000, currency: 'TZS' };
        const toAccount = { _id: 'tenant1:account:def', name: 'CRDB', balance: 5000, currency: 'TZS' };
        const category = { _id: 'tenant1:category:cat3', name: 'Transfer', type: 'expense' };
        mockDb.get.mockImplementation((id: string) => {
            if (id.endsWith('abc')) return Promise.resolve({ ...fromAccount });
            if (id.endsWith('def')) return Promise.resolve({ ...toAccount });
            if (id.includes(':category:')) return Promise.resolve(category);
            return Promise.reject({ statusCode: 404 });
        });
        // First insert (deduct from A) succeeds, second insert (credit to B) fails
        mockDb.insert.mockResolvedValueOnce({ id: fromAccount._id, rev: '2-0' });
        mockDb.insert.mockRejectedValueOnce(new Error('DB error on credit to B'));
        // Rollback inserts for both accounts
        mockDb.insert.mockResolvedValueOnce({ id: fromAccount._id, rev: '3-0' });
        mockDb.insert.mockResolvedValueOnce({ id: toAccount._id, rev: '2-0' });
        const dto = { fromAccountId: 'abc', toAccountId: 'def', amount: 3000, categoryId: 'cat3' };

        try {
            await accountsService.transfer('tenant1', 'user:1', dto);
            fail('Expected transfer to throw BadRequestException');
        } catch (error) {
            expect(error).toBeInstanceOf(BadRequestException);
            expect(error.message).toBe('account.transfer.failed');
        }

        // Verify rollback: 2 successful inserts (from account deducted), then rollback both accounts
        expect(mockDb.insert).toHaveBeenCalled();
        // No transactions should be created since transfer failed
        expect(mockDb.destroy).not.toHaveBeenCalled(); // No transactions to delete since they weren't created
    });

    it('should rollback transfer and delete transactions if transaction creation fails', async () => {
        const fromAccount = { _id: 'tenant1:account:abc', name: 'NMB', balance: 10000, currency: 'TZS' };
        const toAccount = { _id: 'tenant1:account:def', name: 'CRDB', balance: 5000, currency: 'TZS' };
        const category = { _id: 'tenant1:category:cat3', name: 'Transfer', type: 'expense' };
        mockDb.get.mockImplementation((id: string) => {
            if (id.endsWith('abc')) return Promise.resolve({ ...fromAccount });
            if (id.endsWith('def')) return Promise.resolve({ ...toAccount });
            if (id.includes(':category:')) return Promise.resolve(category);
            if (id.includes(':transaction:')) return Promise.resolve({ _id: id, _rev: '1-abc' });
            return Promise.reject({ statusCode: 404 });
        });
        // Both account updates succeed
        mockDb.insert.mockResolvedValueOnce({ id: fromAccount._id, rev: '2-0' });
        mockDb.insert.mockResolvedValueOnce({ id: toAccount._id, rev: '2-0' });
        // First transaction succeeds
        mockDb.insert.mockResolvedValueOnce({ id: 'transaction:1', rev: '1-0' });
        // Second transaction fails
        mockDb.insert.mockRejectedValueOnce(new Error('Transaction creation failed'));
        // Rollback inserts
        mockDb.insert.mockResolvedValue({ id: 'any', rev: '3-0' });
        mockDb.destroy.mockResolvedValue({ ok: true });

        const dto = { fromAccountId: 'abc', toAccountId: 'def', amount: 3000, categoryId: 'cat3' };

        try {
            await accountsService.transfer('tenant1', 'user:1', dto);
            fail('Expected transfer to throw BadRequestException');
        } catch (error) {
            expect(error).toBeInstanceOf(BadRequestException);
            expect(error.message).toBe('account.transfer.failed');
        }

        // Verify transactions were deleted during rollback
        expect(mockDb.destroy).toHaveBeenCalled();
    });

    it('should retrieve transactions for an account', async () => {
        const transactions = [
            { _id: 'tenant1:transaction:1', accountId: 'tenant1:account:abc', type: 'deposit', amount: 5000 },
            { _id: 'tenant1:transaction:2', accountId: 'tenant1:account:abc', type: 'withdraw', amount: 2000 },
        ];
        mockDb.partitionedFind.mockResolvedValue({ docs: transactions });
        const res = await accountsService.getTransactions('tenant1', 'abc');
        expect(res).toHaveLength(2);
        expect(res[0].type).toBe('deposit');
        expect(res[1].type).toBe('withdraw');
    });

    it('should retrieve all transactions when no account specified', async () => {
        const transactions = [
            { _id: 'tenant1:transaction:1', accountId: 'tenant1:account:abc', type: 'deposit', amount: 5000 },
            { _id: 'tenant1:transaction:2', accountId: 'tenant1:account:def', type: 'withdraw', amount: 2000 },
            { _id: 'tenant1:account:xyz', name: 'Other' }, // Should be filtered out
        ];
        mockDb.partitionedFind.mockResolvedValue({ docs: transactions });
        const res = await accountsService.getTransactions('tenant1');
        expect(res).toHaveLength(2);
        expect(res.every((t: any) => t._id.includes(':transaction:'))).toBe(true);
    });
});
