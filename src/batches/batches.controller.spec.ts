import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext } from '@nestjs/common';
import { BatchesController } from './batches.controller';
import { BatchesService } from './batches.service';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';

describe('BatchesController', () => {
  let controller: BatchesController;
  let service: BatchesService;

  const mockBatchesService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findAvailable: jest.fn(),
    findExpiring: jest.fn(),
    findOne: jest.fn(),
  };

  const mockAuthGuard = {
    canActivate: (context: ExecutionContext) => true,
  };

  const mockPermissionsGuard = {
    canActivate: (context: ExecutionContext) => true,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BatchesController],
      providers: [
        {
          provide: BatchesService,
          useValue: mockBatchesService,
        },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue(mockAuthGuard)
      .overrideGuard(PermissionsGuard)
      .useValue(mockPermissionsGuard)
      .compile();

    controller = module.get<BatchesController>(BatchesController);
    service = module.get<BatchesService>(BatchesService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a batch', async () => {
      const dto = {
        productId: 'prod1',
        batchNumber: 'BATCH-001',
        quantity: 100,
        purchaseCost: 1000,
      };
      const req = {
        user: { tenantId: 'tenant1', userId: 'user1', name: 'User One' },
      };

      mockBatchesService.create.mockResolvedValue({ _id: 'batch1', ...dto });

      const result = await controller.create(dto as any, req as any);

      expect(service.create).toHaveBeenCalledWith(
        'tenant1',
        'user1',
        'User One',
        dto,
      );
      expect(result).toHaveProperty('_id');
    });
  });
});
