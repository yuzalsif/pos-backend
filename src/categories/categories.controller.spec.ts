import { Test, TestingModule } from '@nestjs/testing';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { UnauthorizedException, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';

describe('CategoriesController', () => {
    let controller: CategoriesController;
    let service: CategoriesService;

    const mockCategoriesService = {
        create: jest.fn(),
        list: jest.fn(),
        get: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        getSubcategories: jest.fn(),
        getCategoryTree: jest.fn(),
    };

    const mockAuthGuard = {
        canActivate: (context: ExecutionContext) => {
            return true;
        },
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [CategoriesController],
            providers: [
                {
                    provide: CategoriesService,
                    useValue: mockCategoriesService,
                },
            ],
        })
            .overrideGuard(AuthGuard)
            .useValue(mockAuthGuard)
            .compile();

        controller = module.get<CategoriesController>(CategoriesController);
        service = module.get<CategoriesService>(CategoriesService);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });

    describe('create', () => {
        it('should create a category for owner', async () => {
            const dto = { name: 'Sales', type: 'income' as const, description: 'Sales revenue' };
            const req = { user: { tenantId: 'tenant1', userId: 'user:1', role: 'owner' } };
            mockCategoriesService.create.mockResolvedValue({ ...dto, _id: 'tenant1:category:abc' });

            const result = await controller.create(dto, req as any);

            expect(service.create).toHaveBeenCalledWith('tenant1', 'user:1', dto);
            expect(result).toHaveProperty('_id');
        });

        it('should create a category for manager', async () => {
            const dto = { name: 'Rent', type: 'expense' as const };
            const req = { user: { tenantId: 'tenant1', userId: 'user:2', role: 'manager' } };
            mockCategoriesService.create.mockResolvedValue({ ...dto, _id: 'tenant1:category:def' });

            await controller.create(dto, req as any);

            expect(service.create).toHaveBeenCalledWith('tenant1', 'user:2', dto);
        });

        it('should deny access for cashier', () => {
            const dto = { name: 'Sales', type: 'income' as const };
            const req = { user: { tenantId: 'tenant1', userId: 'user:3', role: 'cashier' } };

            expect(() => controller.create(dto, req as any)).toThrow(UnauthorizedException);
        });
    });

    describe('list', () => {
        it('should list all categories', async () => {
            const req = { user: { tenantId: 'tenant1' } };
            mockCategoriesService.list.mockResolvedValue([
                { _id: 'tenant1:category:1', name: 'Sales', type: 'income' },
                { _id: 'tenant1:category:2', name: 'Rent', type: 'expense' },
            ]);

            await controller.list(undefined, req as any);

            expect(service.list).toHaveBeenCalledWith('tenant1', undefined);
        });

        it('should list categories by type', async () => {
            const req = { user: { tenantId: 'tenant1' } };
            mockCategoriesService.list.mockResolvedValue([
                { _id: 'tenant1:category:1', name: 'Sales', type: 'income' },
            ]);

            await controller.list('income', req as any);

            expect(service.list).toHaveBeenCalledWith('tenant1', 'income');
        });
    });

    describe('get', () => {
        it('should get category by id', async () => {
            const req = { user: { tenantId: 'tenant1' } };
            mockCategoriesService.get.mockResolvedValue({
                _id: 'tenant1:category:abc',
                name: 'Sales',
                type: 'income',
            });

            await controller.get('abc', req as any);

            expect(service.get).toHaveBeenCalledWith('tenant1', 'abc');
        });
    });

    describe('getSubcategories', () => {
        it('should get subcategories', async () => {
            const req = { user: { tenantId: 'tenant1' } };
            mockCategoriesService.getSubcategories.mockResolvedValue([
                { _id: 'tenant1:category:sub1', name: 'Online Sales', parentCategoryId: 'tenant1:category:abc' },
            ]);

            await controller.getSubcategories('abc', req as any);

            expect(service.getSubcategories).toHaveBeenCalledWith('tenant1', 'abc');
        });
    });

    describe('getCategoryTree', () => {
        it('should get category tree', async () => {
            const req = { user: { tenantId: 'tenant1' } };
            mockCategoriesService.getCategoryTree.mockResolvedValue([
                {
                    _id: 'tenant1:category:1',
                    name: 'Sales',
                    type: 'income',
                    children: [],
                },
            ]);

            await controller.getTree(undefined, req as any);

            expect(service.getCategoryTree).toHaveBeenCalledWith('tenant1', undefined);
        });

        it('should get category tree by type', async () => {
            const req = { user: { tenantId: 'tenant1' } };
            mockCategoriesService.getCategoryTree.mockResolvedValue([]);

            await controller.getTree('expense', req as any);

            expect(service.getCategoryTree).toHaveBeenCalledWith('tenant1', 'expense');
        });
    });

    describe('update', () => {
        it('should update category for owner', async () => {
            const dto = { name: 'Updated Sales', description: 'All sales' };
            const req = { user: { tenantId: 'tenant1', userId: 'user:1', role: 'owner' } };
            mockCategoriesService.update.mockResolvedValue({ _id: 'tenant1:category:abc', ...dto });

            await controller.update('abc', dto, req as any);

            expect(service.update).toHaveBeenCalledWith('tenant1', 'user:1', 'abc', dto);
        });

        it('should deny update for cashier', () => {
            const dto = { name: 'Updated Sales' };
            const req = { user: { tenantId: 'tenant1', userId: 'user:3', role: 'cashier' } };

            expect(() => controller.update('abc', dto, req as any)).toThrow(UnauthorizedException);
        });
    });

    describe('delete', () => {
        it('should delete category for manager', async () => {
            const req = { user: { tenantId: 'tenant1', userId: 'user:2', role: 'manager' } };
            mockCategoriesService.delete.mockResolvedValue({ deleted: true, id: 'tenant1:category:abc' });

            await controller.delete('abc', req as any);

            expect(service.delete).toHaveBeenCalledWith('tenant1', 'user:2', 'abc');
        });

        it('should deny delete for cashier', () => {
            const req = { user: { tenantId: 'tenant1', userId: 'user:3', role: 'cashier' } };

            expect(() => controller.delete('abc', req as any)).toThrow(UnauthorizedException);
        });
    });
});
