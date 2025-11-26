import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { BatchesService } from './batches.service';
import { StockService } from '../stock/stock.service';

describe('BatchesService', () => {
  let service: BatchesService;
  const mockDb: any = {
    partitionedFind: jest.fn(),
    insert: jest.fn(),
    get: jest.fn(),
    destroy: jest.fn(),
  };

  const mockLogs = { record: jest.fn() };
  const mockStock = { adjustStock: jest.fn() };

  beforeEach(async () => {
    mockDb.partitionedFind.mockReset();
    mockDb.insert.mockReset();
    mockDb.get.mockReset();
    mockDb.destroy.mockReset();
    mockLogs.record.mockReset();
    mockStock.adjustStock.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BatchesService,
        { provide: 'DATABASE_CONNECTION', useValue: mockDb },
        { provide: 'LogsService', useValue: mockLogs },
        { provide: StockService, useValue: mockStock },
      ],
    }).compile();

    service = module.get<BatchesService>(BatchesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a batch successfully', async () => {
      const createDto = {
        productId: 'prod1',
        batchNumber: 'BATCH-001',
        quantity: 100,
        purchaseCost: 1000,
      };

      // Mock product exists
      mockDb.get.mockResolvedValue({
        _id: 'tenant1:product:prod1',
        sku: 'SKU-001',
        trackingType: 'batch',
      });

      // Mock batch doesn't exist
      mockDb.partitionedFind.mockResolvedValue({ docs: [] });

      // Mock insert - returns the batch ID that was generated
      const mockBatchId = 'tenant1:batch:mock-batch-id-123';
      mockDb.insert.mockResolvedValue({ id: mockBatchId, rev: '1-abc' });

      // Mock stock adjustment
      mockStock.adjustStock.mockResolvedValue({});

      const result = await service.create(
        'tenant1',
        'user1',
        'User One',
        createDto as any,
      );

      expect(mockDb.get).toHaveBeenCalledWith('tenant1:product:prod1');
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockStock.adjustStock).toHaveBeenCalledWith(
        'tenant1',
        'user1',
        'User One',
        expect.objectContaining({
          productId: 'tenant1:product:prod1',
          quantity: 100,
          type: 'in',
          purchaseCost: 1000,
          reason: 'Batch BATCH-001 received',
          referenceType: 'batch',
          location: undefined,
        }),
      );
      expect(result).toHaveProperty('_id');
      expect(result.quantityReceived).toBe(100);
      expect(result.quantityAvailable).toBe(100);
    });

    it('should throw ConflictException if batch number exists', async () => {
      const createDto = {
        productId: 'prod1',
        batchNumber: 'BATCH-001',
        quantity: 100,
        purchaseCost: 1000,
      };

      mockDb.get.mockResolvedValue({ _id: 'tenant1:product:prod1' });
      mockDb.partitionedFind.mockResolvedValue({
        docs: [{ _id: 'existing-batch' }],
      });

      await expect(
        service.create('tenant1', 'user1', 'User', createDto as any),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException if product not found', async () => {
      const createDto = {
        productId: 'prod1',
        batchNumber: 'BATCH-001',
        quantity: 100,
        purchaseCost: 1000,
      };

      mockDb.get.mockRejectedValue({ statusCode: 404 });

      await expect(
        service.create('tenant1', 'user1', 'User', createDto as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('should rollback batch creation if stock adjustment fails', async () => {
      const createDto = {
        productId: 'prod1',
        batchNumber: 'BATCH-001',
        quantity: 100,
        purchaseCost: 1000,
      };

      const mockBatchId = 'tenant1:batch:batch-id';
      const mockRev = '1-abc';

      mockDb.get.mockResolvedValue({
        _id: 'tenant1:product:prod1',
        sku: 'SKU-001',
        trackingType: 'batch',
      });

      mockDb.partitionedFind.mockResolvedValue({ docs: [] });
      mockDb.insert.mockResolvedValue({
        id: mockBatchId,
        rev: mockRev,
      });
      mockDb.destroy.mockResolvedValue({ ok: true });

      // Mock stock adjustment fails
      mockStock.adjustStock.mockRejectedValue(new Error('Stock service error'));

      await expect(
        service.create('tenant1', 'user1', 'User One', createDto as any),
      ).rejects.toThrow();

      // Verify rollback was called
      expect(mockStock.adjustStock).toHaveBeenCalled();
      expect(mockDb.destroy).toHaveBeenCalledWith(
        expect.stringContaining('batch'),
        mockRev,
      );
    });

    it('should handle rollback failure gracefully', async () => {
      const createDto = {
        productId: 'prod1',
        batchNumber: 'BATCH-001',
        quantity: 100,
        purchaseCost: 1000,
      };

      mockDb.get.mockResolvedValue({
        _id: 'tenant1:product:prod1',
        sku: 'SKU-001',
        trackingType: 'batch',
      });

      mockDb.partitionedFind.mockResolvedValue({ docs: [] });
      mockDb.insert.mockResolvedValue({
        id: 'tenant1:batch:batch-id',
        rev: '1-abc',
      });

      // Mock both stock adjustment and rollback fail
      mockStock.adjustStock.mockRejectedValue(new Error('Stock service error'));
      mockDb.destroy.mockRejectedValue(new Error('Rollback failed'));

      await expect(
        service.create('tenant1', 'user1', 'User One', createDto as any),
      ).rejects.toThrow();

      // Verify destroy was attempted
      expect(mockDb.destroy).toHaveBeenCalled();
    });
  });

  describe('findAvailable', () => {
    it('should return available batches in FIFO order', async () => {
      // Mock returns batches already sorted by CouchDB
      const batches = [
        { _id: 'b1', expiryDate: '2026-01-01', quantityAvailable: 100 },
        { _id: 'b2', expiryDate: '2026-06-01', quantityAvailable: 50 },
      ];

      mockDb.partitionedFind.mockResolvedValue({ docs: batches });

      const result = await service.findAvailable('tenant1', 'prod1');

      expect(result).toHaveLength(2);
      // Should be sorted by expiry date (FIFO)
      expect(result[0].expiryDate).toBe('2026-01-01');
    });
  });

  describe('findExpiring', () => {
    it('should return batches expiring within specified days', async () => {
      const expiringBatches = [
        { _id: 'b1', expiryDate: '2025-12-01', quantityAvailable: 50 },
      ];

      mockDb.partitionedFind.mockResolvedValue({ docs: expiringBatches });

      const result = await service.findExpiring('tenant1', 30);

      expect(mockDb.partitionedFind).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
  });
});
