import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { StockService } from './stock.service';
import { LogsService } from '../logs/logs.service';

describe('StockService', () => {
  let service: StockService;
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
        StockService,
        { provide: 'DATABASE_CONNECTION', useValue: mockDb },
        { provide: LogsService, useValue: mockLogs },
      ],
    }).compile();

    service = module.get<StockService>(StockService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getCurrentLevel', () => {
    it('should return current stock level for a product', async () => {
      const stockDoc = {
        _id: 'tenant1:stock:prod1',
        productId: 'prod1',
        quantityOnHand: 100,
        quantityReserved: 10,
        quantityAvailable: 90,
      };

      mockDb.get.mockResolvedValue(stockDoc);

      const result = await service.getCurrentLevel('tenant1', 'prod1');

      expect(mockDb.get).toHaveBeenCalledWith('tenant1:stock:prod1');
      expect(result).toEqual(stockDoc);
    });

    it('should return zero stock if stock document does not exist', async () => {
      mockDb.get.mockRejectedValue({ statusCode: 404 });

      const result = await service.getCurrentLevel('tenant1', 'prod1');

      expect(result).toEqual({
        productId: 'prod1',
        quantityOnHand: 0,
        quantityReserved: 0,
        quantityAvailable: 0,
      });
    });
  });

  describe('adjustStock', () => {
    it('should increase stock when type is "in"', async () => {
      const existingStock = {
        _id: 'tenant1:stock:prod1',
        productId: 'prod1',
        quantityOnHand: 50,
        quantityReserved: 5,
        quantityAvailable: 45,
        _rev: '1-abc',
      };

      mockDb.get.mockResolvedValueOnce({ _id: 'tenant1:product:prod1' }); // Product exists
      mockDb.get.mockResolvedValueOnce(existingStock); // Stock doc
      mockDb.insert.mockResolvedValue({ id: 'stock-id', rev: '2-def' });

      const adjustDto = {
        productId: 'prod1',
        quantity: 20,
        type: 'in' as const,
        reason: 'Purchase received',
        referenceId: 'batch1',
        referenceType: 'batch',
      };

      const result = await service.adjustStock(
        'tenant1',
        'user1',
        'User',
        adjustDto,
      );

      expect(result.quantityOnHand).toBe(70); // 50 + 20
      expect(result.quantityAvailable).toBe(65); // 45 + 20
      expect(mockLogs.record).toHaveBeenCalledWith(
        'tenant1',
        { userId: 'user1', name: 'User' },
        'stock.adjust',
        'stock',
        'prod1',
        expect.objectContaining({ type: 'in', quantity: 20 }),
      );
    });

    it('should decrease stock when type is "out"', async () => {
      const existingStock = {
        _id: 'tenant1:stock:prod1',
        productId: 'prod1',
        quantityOnHand: 50,
        quantityReserved: 5,
        quantityAvailable: 45,
        _rev: '1-abc',
      };

      mockDb.get.mockResolvedValueOnce({ _id: 'tenant1:product:prod1' });
      mockDb.get.mockResolvedValueOnce(existingStock);
      mockDb.insert.mockResolvedValue({ id: 'stock-id', rev: '2-def' });

      const adjustDto = {
        productId: 'prod1',
        quantity: 15,
        type: 'out' as const,
        reason: 'Sale',
        referenceId: 'sale1',
        referenceType: 'sale',
      };

      const result = await service.adjustStock(
        'tenant1',
        'user1',
        'User',
        adjustDto,
      );

      expect(result.quantityOnHand).toBe(35); // 50 - 15
      expect(result.quantityAvailable).toBe(30); // 45 - 15
    });

    it('should create new stock document if it does not exist', async () => {
      mockDb.get.mockResolvedValueOnce({ _id: 'tenant1:product:prod1' });
      mockDb.get.mockRejectedValueOnce({ statusCode: 404 }); // No stock doc
      mockDb.insert.mockResolvedValue({ id: 'stock-id', rev: '1-new' });

      const adjustDto = {
        productId: 'prod1',
        quantity: 10,
        type: 'in' as const,
        reason: 'Initial stock',
      };

      const result = await service.adjustStock(
        'tenant1',
        'user1',
        'User',
        adjustDto,
      );

      expect(result.quantityOnHand).toBe(10);
      expect(result.quantityAvailable).toBe(10);
      expect(result.quantityReserved).toBe(0);
    });
  });

  describe('getLowStockProducts', () => {
    it('should return products with stock below minimum level', async () => {
      const products = [
        {
          _id: 'tenant1:product:prod1',
          productId: 'prod1',
          minimumStockLevel: 20,
        },
        {
          _id: 'tenant1:product:prod2',
          productId: 'prod2',
          minimumStockLevel: 50,
        },
      ];

      const stockRecords = [
        { productId: 'prod1', quantityOnHand: 15, quantityAvailable: 15 },
        { productId: 'prod2', quantityOnHand: 30, quantityAvailable: 30 },
      ];

      mockDb.partitionedFind.mockResolvedValueOnce({ docs: products });
      mockDb.partitionedFind.mockResolvedValueOnce({ docs: stockRecords });

      const result = await service.getLowStockProducts('tenant1');

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        productId: 'prod1',
        currentStock: 15,
        minimumLevel: 20,
      });
    });
  });
});
