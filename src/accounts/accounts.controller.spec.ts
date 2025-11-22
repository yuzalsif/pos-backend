import { Test, TestingModule } from '@nestjs/testing';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { UnauthorizedException, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';

describe('AccountsController', () => {
    let controller: AccountsController;
    let service: AccountsService;

    const mockAccountsService = {
        create: jest.fn(),
        list: jest.fn(),
        get: jest.fn(),
        deposit: jest.fn(),
        withdraw: jest.fn(),
        transfer: jest.fn(),
        getTransactions: jest.fn(),
    };

    // Mock AuthGuard to bypass authentication in tests
    const mockAuthGuard = {
        canActivate: (context: ExecutionContext) => {
            return true; // Always allow access in tests
        },
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [AccountsController],
            providers: [
                {
                    provide: AccountsService,
                    useValue: mockAccountsService,
                },
            ],
        })
            .overrideGuard(AuthGuard)
            .useValue(mockAuthGuard)
            .compile();

        controller = module.get<AccountsController>(AccountsController);
        service = module.get<AccountsService>(AccountsService);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });

    describe('create', () => {
        it('should create an account for owner', async () => {
            const dto = { name: 'NMB', initialBalance: 5000, type: 'bank', currency: 'TZS' };
            const req = { user: { tenantId: 'tenant1', userId: 'user:1', role: 'owner' } };
            mockAccountsService.create.mockResolvedValue({ ...dto, _id: 'tenant1:account:NMB' });

            const result = await controller.create(dto, req as any);

            expect(service.create).toHaveBeenCalledWith('tenant1', 'user:1', dto);
            expect(result).toHaveProperty('_id');
        });

        it('should create an account for manager', async () => {
            const dto = { name: 'CRDB', initialBalance: 10000, type: 'bank', currency: 'TZS' };
            const req = { user: { tenantId: 'tenant1', userId: 'user:2', role: 'manager' } };
            mockAccountsService.create.mockResolvedValue({ ...dto, _id: 'tenant1:account:CRDB' });

            await controller.create(dto, req as any);

            expect(service.create).toHaveBeenCalledWith('tenant1', 'user:2', dto);
        });

        it('should deny access for cashier', () => {
            const dto = { name: 'NMB', initialBalance: 5000, type: 'bank', currency: 'TZS' };
            const req = { user: { tenantId: 'tenant1', userId: 'user:3', role: 'cashier' } };

            expect(() => controller.create(dto, req as any)).toThrow(UnauthorizedException);
        });
    });

    describe('deposit', () => {
        it('should allow deposit for cashier', async () => {
            const dto = { amount: 1000, categoryId: 'cat1' };
            const req = { user: { tenantId: 'tenant1', userId: 'user:3', role: 'cashier' } };
            mockAccountsService.deposit.mockResolvedValue({ account: {}, transaction: {} });

            await controller.deposit('abc', dto, req as any);

            expect(service.deposit).toHaveBeenCalledWith('tenant1', 'user:3', 'abc', dto);
        });

        it('should allow deposit for manager', async () => {
            const dto = { amount: 2000, categoryId: 'cat1' };
            const req = { user: { tenantId: 'tenant1', userId: 'user:2', role: 'manager' } };
            mockAccountsService.deposit.mockResolvedValue({ account: {}, transaction: {} });

            await controller.deposit('abc', dto, req as any);

            expect(service.deposit).toHaveBeenCalledWith('tenant1', 'user:2', 'abc', dto);
        });
    });

    describe('withdraw', () => {
        it('should allow withdraw for owner', async () => {
            const dto = { amount: 500, categoryId: 'cat2' };
            const req = { user: { tenantId: 'tenant1', userId: 'user:1', role: 'owner' } };
            mockAccountsService.withdraw.mockResolvedValue({ account: {}, transaction: {} });

            await controller.withdraw('abc', dto, req as any);

            expect(service.withdraw).toHaveBeenCalledWith('tenant1', 'user:1', 'abc', dto);
        });
    });

    describe('transfer', () => {
        it('should allow transfer for owner', async () => {
            const dto = { fromAccountId: 'abc', toAccountId: 'def', amount: 1000, categoryId: 'cat3' };
            const req = { user: { tenantId: 'tenant1', userId: 'user:1', role: 'owner' } };
            mockAccountsService.transfer.mockResolvedValue({ from: {}, to: {}, transactions: [] });

            await controller.transfer(dto, req as any);

            expect(service.transfer).toHaveBeenCalledWith('tenant1', 'user:1', dto);
        });

        it('should deny transfer for cashier', () => {
            const dto = { fromAccountId: 'abc', toAccountId: 'def', amount: 1000, categoryId: 'cat3' };
            const req = { user: { tenantId: 'tenant1', userId: 'user:3', role: 'cashier' } };

            expect(() => controller.transfer(dto, req as any)).toThrow(UnauthorizedException);
        });
    });

    describe('getTransactions', () => {
        it('should get transactions for an account', async () => {
            const req = { user: { tenantId: 'tenant1' } };
            mockAccountsService.getTransactions.mockResolvedValue([]);

            await controller.getTransactions('abc', req as any);

            expect(service.getTransactions).toHaveBeenCalledWith('tenant1', 'abc');
        });

        it('should get all transactions', async () => {
            const req = { user: { tenantId: 'tenant1' } };
            mockAccountsService.getTransactions.mockResolvedValue([]);

            await controller.getAllTransactions(req as any);

            expect(service.getTransactions).toHaveBeenCalledWith('tenant1');
        });
    });
});
