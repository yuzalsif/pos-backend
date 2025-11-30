import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InventoryItemsService } from './inventory-items.service';
import { LogsService } from '../logs/logs.service';
import { BatchesService } from '../batches/batches.service';
import { StockService } from '../stock/stock.service';

describe('InventoryItemsService', () => {
  let service: InventoryItemsService;
  const mockDb: any = {
    partitionedFind: jest.fn(),
    insert: jest.fn(),
    get: jest.fn(),
  };

  const mockLogs = { record: jest.fn() };

  const mockBatches = { create: jest.fn() };
  const mockStock = { adjustStock: jest.fn() };

  beforeEach(async () => {
    mockDb.partitionedFind.mockReset().mockResolvedValue({ docs: [] });
    mockDb.insert.mockReset();
    mockDb.get.mockReset();
    mockLogs.record.mockReset();
    mockBatches.create.mockReset();
    mockStock.adjustStock.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryItemsService,
        { provide: 'DATABASE_CONNECTION', useValue: mockDb },
        { provide: LogsService, useValue: mockLogs },
        { provide: BatchesService, useValue: mockBatches },
        { provide: StockService, useValue: mockStock },
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

  describe('createOpeningStock', () => {
    const tenantId = 'tenant1';
    const userId = 'user1';
    const userName = 'Test User';

    it('should create opening stock for regular (non-tracked) products', async () => {
      const openingStockDto = {
        entryDate: '2025-11-30',
        location: 'Main Warehouse',
        items: [
          {
            productId: 'prod1',
            quantity: 100,
            unitCost: 50,
            notes: 'Initial stock',
          },
        ],
        notes: 'Opening inventory',
      };

      const mockProduct = {
        _id: `${tenantId}:product:prod1`,
        sku: 'PROD-001',
        name: 'Test Product',
        trackingType: 'none',
      };

      mockDb.get.mockResolvedValue(mockProduct);
      mockStock.adjustStock.mockResolvedValue({ success: true });
      mockDb.insert.mockResolvedValue({ id: 'opening-stock-id', rev: '1-abc' });

      const result = await service.createOpeningStock(
        tenantId,
        userId,
        userName,
        openingStockDto as any,
      );

      expect(mockStock.adjustStock).toHaveBeenCalledWith(
        tenantId,
        userId,
        userName,
        expect.objectContaining({
          productId: `${tenantId}:product:prod1`,
          quantity: 100,
          referenceType: 'opening_stock',
          type: 'in',
        }),
      );
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockLogs.record).toHaveBeenCalled();
      expect(result).toHaveProperty('entryNumber');
      expect(result.items[0].quantity).toBe(100);
    });

    it('should create opening stock for batch-tracked products', async () => {
      const openingStockDto = {
        entryDate: '2025-11-30',
        location: 'Main Warehouse',
        items: [
          {
            productId: 'prod2',
            quantity: 50,
            unitCost: 75,
            batchNumber: 'BATCH-001',
            expiryDate: '2025-12-31',
          },
        ],
      };

      const mockProduct = {
        _id: `${tenantId}:product:prod2`,
        sku: 'PROD-002',
        name: 'Batch Product',
        trackingType: 'batch',
      };

      mockDb.get.mockResolvedValue(mockProduct);
      mockBatches.create.mockResolvedValue({
        _id: `${tenantId}:batch:batch-id`,
        batchNumber: 'BATCH-001',
        productId: 'prod2',
        quantity: 50,
        expiryDate: '2025-12-31',
      });
      mockDb.insert.mockResolvedValue({ id: 'opening-stock-id', rev: '1-abc' });

      const result = await service.createOpeningStock(
        tenantId,
        userId,
        userName,
        openingStockDto as any,
      );

      expect(mockBatches.create).toHaveBeenCalledWith(
        tenantId,
        userId,
        userName,
        expect.objectContaining({
          productId: `${tenantId}:product:prod2`,
          batchNumber: 'BATCH-001',
          quantity: 50,
          expiryDate: '2025-12-31',
          purchaseCost: 75,
        }),
      );
      expect(mockDb.insert).toHaveBeenCalled();
      expect(result.batchIds).toContain(`${tenantId}:batch:batch-id`);
      expect(result.items[0].batchNumber).toBe('BATCH-001');
    });

    it('should create opening stock for serial-tracked products', async () => {
      const openingStockDto = {
        entryDate: '2025-11-30',
        location: 'Main Warehouse',
        items: [
          {
            productId: 'prod3',
            quantity: 3,
            unitCost: 500,
            serialNumbers: ['SN001', 'SN002', 'SN003'],
          },
        ],
      };

      const mockProduct = {
        _id: `${tenantId}:product:prod3`,
        sku: 'PROD-003',
        name: 'Serial Product',
        trackingType: 'serial',
      };

      mockDb.get.mockResolvedValue(mockProduct);
      mockDb.partitionedFind.mockResolvedValue({ docs: [] }); // No existing serials
      mockDb.insert
        .mockResolvedValueOnce({ id: 'item-id-1', rev: '1-abc' })
        .mockResolvedValueOnce({ id: 'item-id-2', rev: '1-def' })
        .mockResolvedValueOnce({ id: 'item-id-3', rev: '1-ghi' })
        .mockResolvedValueOnce({ id: 'opening-stock-id', rev: '1-jkl' });

      const result = await service.createOpeningStock(
        tenantId,
        userId,
        userName,
        openingStockDto as any,
      );

      expect(mockDb.insert).toHaveBeenCalledTimes(4); // 3 inventory items + 1 opening stock record
      expect(result.serialIds).toHaveLength(3);
      expect(result.items[0].serialNumbers).toEqual(['SN001', 'SN002', 'SN003']);
    });

    it('should throw BadRequestException if serial count mismatch', async () => {
      const openingStockDto = {
        entryDate: '2025-11-30',
        location: 'Main Warehouse',
        items: [
          {
            productId: 'prod3',
            quantity: 5,
            unitCost: 500,
            serialNumbers: ['SN001', 'SN002'], // Only 2 serials for 5 quantity
          },
        ],
      };

      const mockProduct = {
        _id: `${tenantId}:product:prod3`,
        sku: 'PROD-003',
        name: 'Serial Product',
        trackingType: 'serial',
      };

      mockDb.get.mockResolvedValue(mockProduct);

      await expect(
        service.createOpeningStock(tenantId, userId, userName, openingStockDto as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should generate unique opening stock entry numbers', async () => {
      const openingStockDto = {
        entryDate: '2025-11-30',
        location: 'Main Warehouse',
        items: [
          {
            productId: 'prod1',
            quantity: 10,
            unitCost: 50,
          },
        ],
      };

      const mockProduct = {
        _id: `${tenantId}:product:prod1`,
        sku: 'PROD-001',
        name: 'Test Product',
        trackingType: 'none',
      };

      // Mock existing entry with same date
      mockDb.partitionedFind.mockResolvedValueOnce({
        docs: [{ entryNumber: 'OS-20251130-001' }],
      });

      mockDb.get.mockResolvedValue(mockProduct);
      mockStock.adjustStock.mockResolvedValue({ success: true });
      mockDb.insert.mockResolvedValue({ id: 'opening-stock-id', rev: '1-abc' });

      const result = await service.createOpeningStock(
        tenantId,
        userId,
        userName,
        openingStockDto as any,
      );

      expect(result.entryNumber).toBe('OS-20251130-002');
    });
  });
});
