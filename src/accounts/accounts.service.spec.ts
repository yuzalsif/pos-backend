import { ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
// import { AccountsService } from './accounts.service'; // to be implemented

describe('AccountsService (unit)', () => {
    let accountsService: any; // will be AccountsService
    const mockDb: any = {
        partitionedFind: jest.fn(),
        get: jest.fn(),
        insert: jest.fn(),
    };
    const mockLogs: any = { record: jest.fn() };

    beforeEach(() => {
        mockDb.partitionedFind.mockReset();
        mockDb.get.mockReset();
        mockDb.insert.mockReset();
        mockLogs.record.mockReset();
        // accountsService = new AccountsService(mockDb as any, mockLogs as any); // to be implemented
    });

    it('should create account with initial balance and log', async () => {
        // mock no duplicate
        mockDb.partitionedFind.mockResolvedValue({ docs: [] });
        mockDb.insert.mockResolvedValue({ id: 'tenant1:account:abc', rev: '1-0' });
        const dto = { name: 'NMB', initialBalance: 10000, type: 'bank', currency: 'TZS' };
        // const res = await accountsService.create('tenant1', 'user:1', dto);
        // expect(mockDb.insert).toHaveBeenCalled();
        // expect(res.balance).toBe(10000);
        // expect(res.name).toBe('NMB');
        // expect(mockLogs.record).toHaveBeenCalledWith('tenant1', { userId: 'user:1' }, 'account.create', 'account', expect.any(String), { name: 'NMB' });
    });

    it('should not create account with duplicate name', async () => {
        mockDb.partitionedFind.mockResolvedValue({ docs: [{ _id: 'tenant1:account:xyz', name: 'NMB' }] });
        const dto = { name: 'NMB', initialBalance: 10000 };
        // await expect(accountsService.create('tenant1', 'user:1', dto)).rejects.toThrow(ConflictException);
    });

    it('should not create account with negative initial balance', async () => {
        mockDb.partitionedFind.mockResolvedValue({ docs: [] });
        const dto = { name: 'CRDB', initialBalance: -500 };
        // await expect(accountsService.create('tenant1', 'user:1', dto)).rejects.toThrow(BadRequestException);
    });

    it('should get account by id', async () => {
        mockDb.get.mockResolvedValue({ _id: 'tenant1:account:abc', name: 'NMB', balance: 10000 });
        // const res = await accountsService.get('tenant1', 'abc');
        // expect(res.name).toBe('NMB');
        // expect(res.balance).toBe(10000);
    });

    it('should throw NotFoundException if account not found', async () => {
        mockDb.get.mockRejectedValue({ statusCode: 404 });
        // await expect(accountsService.get('tenant1', 'missing')).rejects.toThrow(NotFoundException);
    });

    it('should list accounts', async () => {
        const docs = [{ _id: 'tenant1:account:1', name: 'NMB' }, { _id: 'tenant1:account:2', name: 'CRDB' }];
        mockDb.partitionedFind.mockResolvedValue({ docs });
        // const res = await accountsService.list('tenant1');
        // expect(res).toEqual(docs);
    });

    it('should deposit money and update balance, log', async () => {
        const account = { _id: 'tenant1:account:abc', name: 'NMB', balance: 10000 };
        mockDb.get.mockResolvedValue(account);
        mockDb.insert.mockResolvedValue({ id: account._id, rev: '2-0' });
        const dto = { amount: 5000, categoryId: 'cat1' };
        // const res = await accountsService.deposit('tenant1', 'user:1', 'abc', dto);
        // expect(mockDb.insert).toHaveBeenCalled();
        // expect(res.balance).toBe(15000);
        // expect(mockLogs.record).toHaveBeenCalledWith('tenant1', { userId: 'user:1' }, 'account.deposit', 'account', account._id, { amount: 5000, categoryId: 'cat1' });
    });

    it('should withdraw money and update balance, log', async () => {
        const account = { _id: 'tenant1:account:abc', name: 'NMB', balance: 10000 };
        mockDb.get.mockResolvedValue(account);
        mockDb.insert.mockResolvedValue({ id: account._id, rev: '2-0' });
        const dto = { amount: 4000, categoryId: 'cat2' };
        // const res = await accountsService.withdraw('tenant1', 'user:1', 'abc', dto);
        // expect(mockDb.insert).toHaveBeenCalled();
        // expect(res.balance).toBe(6000);
        // expect(mockLogs.record).toHaveBeenCalledWith('tenant1', { userId: 'user:1' }, 'account.withdraw', 'account', account._id, { amount: 4000, categoryId: 'cat2' });
    });

    it('should not withdraw more than balance', async () => {
        const account = { _id: 'tenant1:account:abc', name: 'NMB', balance: 1000 };
        mockDb.get.mockResolvedValue(account);
        const dto = { amount: 2000, categoryId: 'cat2' };
        // await expect(accountsService.withdraw('tenant1', 'user:1', 'abc', dto)).rejects.toThrow(BadRequestException);
    });

    // --- Transfer scenarios ---
    it('should transfer money atomically between accounts and log', async () => {
        const fromAccount = { _id: 'tenant1:account:abc', name: 'NMB', balance: 10000, currency: 'TZS' };
        const toAccount = { _id: 'tenant1:account:def', name: 'CRDB', balance: 5000, currency: 'TZS' };
        mockDb.get.mockImplementation((id: string) => {
            if (id.endsWith('abc')) return Promise.resolve(fromAccount);
            if (id.endsWith('def')) return Promise.resolve(toAccount);
            return Promise.reject({ statusCode: 404 });
        });
        mockDb.insert.mockResolvedValueOnce({ id: fromAccount._id, rev: '2-0' });
        mockDb.insert.mockResolvedValueOnce({ id: toAccount._id, rev: '2-0' });
        const dto = { fromAccountId: 'abc', toAccountId: 'def', amount: 3000, categoryId: 'cat3' };
        // const res = await accountsService.transfer('tenant1', 'user:1', dto);
        // expect(mockDb.insert).toHaveBeenCalledTimes(2);
        // expect(res.from.balance).toBe(7000);
        // expect(res.to.balance).toBe(8000);
        // expect(mockLogs.record).toHaveBeenCalledWith('tenant1', { userId: 'user:1' }, 'account.transfer', 'account', expect.any(String), { fromAccountId: 'abc', toAccountId: 'def', amount: 3000, categoryId: 'cat3' });
    });

    it('should not transfer if currencies do not match', async () => {
        const fromAccount = { _id: 'tenant1:account:abc', name: 'NMB', balance: 10000, currency: 'TZS' };
        const toAccount = { _id: 'tenant1:account:def', name: 'CRDB', balance: 5000, currency: 'USD' };
        mockDb.get.mockImplementation((id: string) => {
            if (id.endsWith('abc')) return Promise.resolve(fromAccount);
            if (id.endsWith('def')) return Promise.resolve(toAccount);
            return Promise.reject({ statusCode: 404 });
        });
        const dto = { fromAccountId: 'abc', toAccountId: 'def', amount: 1000, categoryId: 'cat3' };
        // await expect(accountsService.transfer('tenant1', 'user:1', dto)).rejects.toThrow(BadRequestException);
    });

    it('should not transfer more than available in from account', async () => {
        const fromAccount = { _id: 'tenant1:account:abc', name: 'NMB', balance: 500, currency: 'TZS' };
        const toAccount = { _id: 'tenant1:account:def', name: 'CRDB', balance: 5000, currency: 'TZS' };
        mockDb.get.mockImplementation((id: string) => {
            if (id.endsWith('abc')) return Promise.resolve(fromAccount);
            if (id.endsWith('def')) return Promise.resolve(toAccount);
            return Promise.reject({ statusCode: 404 });
        });
        const dto = { fromAccountId: 'abc', toAccountId: 'def', amount: 1000, categoryId: 'cat3' };
        // await expect(accountsService.transfer('tenant1', 'user:1', dto)).rejects.toThrow(BadRequestException);
    });

    it('should not transfer if either account does not exist', async () => {
        mockDb.get.mockImplementation((id: string) => Promise.reject({ statusCode: 404 }));
        const dto = { fromAccountId: 'abc', toAccountId: 'def', amount: 1000, categoryId: 'cat3' };
        // await expect(accountsService.transfer('tenant1', 'user:1', dto)).rejects.toThrow(NotFoundException);
    });

    it('should rollback transfer if credit to B fails after deduction from A', async () => {
        // Simulate deduction from A succeeds, but credit to B fails
        let fromAccount = { _id: 'tenant1:account:abc', name: 'NMB', balance: 10000, currency: 'TZS' };
        let toAccount = { _id: 'tenant1:account:def', name: 'CRDB', balance: 5000, currency: 'TZS' };
        mockDb.get.mockImplementation((id: string) => {
            if (id.endsWith('abc')) return Promise.resolve(fromAccount);
            if (id.endsWith('def')) return Promise.resolve(toAccount);
            return Promise.reject({ statusCode: 404 });
        });
        // First insert (deduct from A) succeeds, second insert (credit to B) fails
        mockDb.insert.mockResolvedValueOnce({ id: fromAccount._id, rev: '2-0' });
        mockDb.insert.mockRejectedValueOnce(new Error('DB error on credit to B'));
        const dto = { fromAccountId: 'abc', toAccountId: 'def', amount: 3000, categoryId: 'cat3' };
        // await expect(accountsService.transfer('tenant1', 'user:1', dto)).rejects.toThrow(Error);
        // After failure, balances should remain unchanged
        // expect(fromAccount.balance).toBe(10000);
        // expect(toAccount.balance).toBe(5000);
    });
});
