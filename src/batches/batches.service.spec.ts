import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { BatchesService } from './batches.service';

describe('BatchesService', () => {
  let service: BatchesService;
  const mockDb: any = {
    partitionedFind: jest.fn(),
    insert: jest.fn(),
    get: jest.fn(),
  };

  const mockLogs = { record: jest.fn() };

  beforeEach(async () => {
    mockDb.partitionedFind.mockReset();
    mockDb.insert.mockReset();
    mockDb.get.mockReset();
    mockLogs.record.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BatchesService,
        { provide: 'DATABASE_CONNECTION', useValue: mockDb },
        { provide: 'LogsService', useValue: mockLogs },
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

      // Mock insert
      mockDb.insert.mockResolvedValue({ id: 'batch-id', rev: '1-abc' });

      const result = await service.create(
        'tenant1',
        'user1',
        'User One',
        createDto as any,
      );

      expect(mockDb.get).toHaveBeenCalledWith('tenant1:product:prod1');
      expect(mockDb.insert).toHaveBeenCalled();
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
