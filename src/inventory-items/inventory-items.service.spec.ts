import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { InventoryItemsService } from './inventory-items.service';
import { LogsService } from '../logs/logs.service';

describe('InventoryItemsService', () => {
  let service: InventoryItemsService;
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
        InventoryItemsService,
        { provide: 'DATABASE_CONNECTION', useValue: mockDb },
        { provide: LogsService, useValue: mockLogs },
      ],
    }).compile();

    service = module.get<InventoryItemsService>(InventoryItemsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create an inventory item successfully', async () => {
      const createDto = {
        productId: 'prod1',
        serialNumber: 'IMEI:123456789012345',
        status: 'in_stock',
        condition: 'new',
      };

      // Mock product exists and requires serial tracking
      mockDb.get.mockResolvedValue({
        _id: 'tenant1:product:prod1',
        sku: 'IP16-256-BLK',
        trackingType: 'serial',
      });

      // Mock serial doesn't exist
      mockDb.partitionedFind.mockResolvedValue({ docs: [] });

      // Mock insert
      mockDb.insert.mockResolvedValue({ id: 'item-id', rev: '1-abc' });

      const result = await service.create(
        'tenant1',
        'user1',
        'User One',
        createDto as any,
      );

      expect(mockDb.get).toHaveBeenCalledWith('tenant1:product:prod1');
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockLogs.record).toHaveBeenCalledWith(
        'tenant1',
        { userId: 'user1', name: 'User One' },
        'inventory-item.create',
        'inventory-item',
        expect.any(String),
        expect.objectContaining({
          serialNumber: 'IMEI:123456789012345',
          productId: 'prod1',
        }),
      );
      expect(result).toHaveProperty('inventoryItem');
      expect(result.inventoryItem).toHaveProperty('_id');
      expect(result.inventoryItem.serialNumber).toBe('IMEI:123456789012345');
      expect(result.inventoryItem.status).toBe('in_stock');
      expect(result.batch).toBeNull();
      expect(result.remainingUntracked).toBeNull();
    });

    it('should create inventory item with batch and return remaining untracked', async () => {
      const createDto = {
        productId: 'prod1',
        serialNumber: 'IMEI:999888777666',
        batchId: 'batch1',
        status: 'in_stock',
        condition: 'new',
      };

      // Mock product exists
      mockDb.get.mockResolvedValueOnce({
        _id: 'tenant1:product:prod1',
        sku: 'IP16-256-BLK',
        trackingType: 'both',
      });

      // Mock serial doesn't exist (first call)
      mockDb.partitionedFind.mockResolvedValueOnce({ docs: [] });

      // Mock batch exists (second get call)
      mockDb.get.mockResolvedValueOnce({
        _id: 'tenant1:batch:batch1',
        batchId: 'batch1',
        batchNumber: 'BATCH-001',
        quantityReceived: 10,
        quantityAvailable: 8,
        productId: 'prod1',
      });

      // Mock insert
      mockDb.insert.mockResolvedValue({ id: 'item-id', rev: '1-abc' });

      // Mock count query - 2 items already serialized
      mockDb.partitionedFind.mockResolvedValueOnce({ docs: [{}, {}] });

      const result = await service.create(
        'tenant1',
        'user1',
        'User One',
        createDto as any,
      );

      expect(result.inventoryItem.batchId).toBe('batch1');
      expect(result.batch).toEqual({
        batchId: 'batch1',
        batchNumber: 'BATCH-001',
        quantityReceived: 10,
        quantityAvailable: 8,
      });
      expect(result.remainingUntracked).toBe(6); // 8 available - 2 already serialized
    });

    it('should throw ConflictException if serial number exists', async () => {
      const createDto = {
        productId: 'prod1',
        serialNumber: 'IMEI:123456789012345',
      };

      mockDb.get.mockResolvedValue({
        _id: 'tenant1:product:prod1',
        trackingType: 'serial',
      });
      mockDb.partitionedFind.mockResolvedValue({
        docs: [{ _id: 'existing-item' }],
      });

      await expect(
        service.create('tenant1', 'user1', 'User', createDto as any),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException if product not found', async () => {
      const createDto = {
        productId: 'prod1',
        serialNumber: 'IMEI:123456789012345',
      };

      mockDb.get.mockRejectedValue({ statusCode: 404 });

      await expect(
        service.create('tenant1', 'user1', 'User', createDto as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findBySerial', () => {
    it('should find inventory item by serial number', async () => {
      const item = {
        _id: 'tenant1:inventory-item:item1',
        serialNumber: 'IMEI:123456789012345',
        status: 'in_stock',
      };

      mockDb.partitionedFind.mockResolvedValue({ docs: [item] });

      const result = await service.findBySerial(
        'tenant1',
        'IMEI:123456789012345',
      );

      expect(result).toEqual(item);
      expect(mockDb.partitionedFind).toHaveBeenCalledWith('tenant1', {
        selector: {
          type: 'inventory-item',
          serialNumber: 'IMEI:123456789012345',
        },
        limit: 1,
      });
    });

    it('should throw NotFoundException if serial not found', async () => {
      mockDb.partitionedFind.mockResolvedValue({ docs: [] });

      await expect(service.findBySerial('tenant1', 'IMEI:999')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findAvailableByProduct', () => {
    it('should return available items for a product', async () => {
      const items = [
        { _id: 'item1', serialNumber: 'IMEI:111', status: 'in_stock' },
        { _id: 'item2', serialNumber: 'IMEI:222', status: 'in_stock' },
      ];

      mockDb.partitionedFind.mockResolvedValue({ docs: items });

      const result = await service.findAvailableByProduct('tenant1', 'prod1');

      expect(result).toHaveLength(2);
      expect(result[0].status).toBe('in_stock');
    });
  });

  describe('update', () => {
    it('should update inventory item status', async () => {
      const existingItem = {
        _id: 'tenant1:inventory-item:item1',
        serialNumber: 'IMEI:123',
        status: 'in_stock',
      };

      mockDb.get.mockResolvedValue(existingItem);
      mockDb.insert.mockResolvedValue({ id: 'item1', rev: '2-abc' });

      const updateDto = { status: 'sold', saleId: 'sale123' };
      const result = await service.update(
        'tenant1',
        'user1',
        'User',
        'item1',
        updateDto as any,
      );

      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockLogs.record).toHaveBeenCalledWith(
        'tenant1',
        { userId: 'user1', name: 'User' },
        'inventory-item.update',
        'inventory-item',
        'item1',
        expect.objectContaining({
          changes: updateDto,
          serialNumber: 'IMEI:123',
        }),
      );
      expect(result.status).toBe('sold');
      expect(result.saleId).toBe('sale123');
    });

    it('should throw NotFoundException if item not found', async () => {
      mockDb.get.mockRejectedValue({ statusCode: 404 });

      await expect(
        service.update('tenant1', 'user1', 'User', 'item1', {
          status: 'sold',
        } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
