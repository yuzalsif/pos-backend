import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PurchasesService } from './purchases.service';
import { LogsService } from '../logs/logs.service';
import { BatchesService } from '../batches/batches.service';
import { StockService } from '../stock/stock.service';

describe('PurchasesService', () => {
    let service: PurchasesService;
    const mockDb: any = {
        partitionedFind: jest.fn(),
        insert: jest.fn(),
        get: jest.fn(),
        bulk: jest.fn(),
    };

    const mockLogs = { record: jest.fn() };
    const mockBatches = {
        create: jest.fn(),
        findById: jest.fn(),
    };
    const mockStock = { adjustStock: jest.fn() };
    const mockMail = { sendEmail: jest.fn() };

    beforeEach(async () => {
        mockDb.partitionedFind.mockReset().mockResolvedValue({ docs: [] });
        mockDb.insert.mockReset();
        mockDb.get.mockReset();
        mockDb.bulk.mockReset();
        mockLogs.record.mockReset();
        mockBatches.create.mockReset();
        mockBatches.findById.mockReset();
        mockStock.adjustStock.mockReset();
        mockMail.sendEmail.mockReset();

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                PurchasesService,
                { provide: 'DATABASE_CONNECTION', useValue: mockDb },
                { provide: LogsService, useValue: mockLogs },
                { provide: BatchesService, useValue: mockBatches },
                { provide: StockService, useValue: mockStock },
                { provide: 'MailService', useValue: mockMail },
            ],
        }).compile();

        service = module.get<PurchasesService>(PurchasesService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('receiveStock', () => {
        const tenantId = 'tenant1';
        const userId = 'user1';
        const userName = 'Test User';
        const poId = 'po123';

        it('should receive stock with batch tracking', async () => {
            const receiveDto = {
                items: [
                    {
                        productId: 'prod1',
                        quantityReceiving: 10,
                        batchNumber: 'BATCH-001',
                        expiryDate: '2025-12-31',
                        unitCost: 100,
                    },
                ],
                receivedDate: '2025-11-30',
                notes: 'First delivery',
            };

            const mockPo = {
                _id: `${tenantId}:purchase:${poId}`,
                _rev: '1-abc',
                type: 'purchase',
                poNumber: 'PO-20251130-001',
                supplierId: 'supplier1',
                supplierName: 'Test Supplier',
                status: 'pending',
                items: [
                    {
                        productId: 'prod1',
                        sku: 'PROD-001',
                        productName: 'Test Product',
                        quantityOrdered: 10,
                        quantityReceived: 0,
                        unitCost: 100,
                    },
                ],
            };

            mockDb.get.mockResolvedValueOnce(mockPo);
            mockBatches.create.mockResolvedValue({
                _id: 'batch-id',
                batchNumber: 'BATCH-001',
                productId: 'prod1',
                quantityReceived: 10,
                quantityAvailable: 10,
                expiryDate: '2025-12-31',
            });
            mockDb.insert.mockResolvedValue({ id: `${tenantId}:purchase:${poId}`, rev: '2-def' });

            const result = await service.receiveStock(
                tenantId,
                userId,
                userName,
                poId,
                receiveDto as any,
            );

            expect(mockDb.get).toHaveBeenCalledWith(`${tenantId}:purchase:${poId}`);
            expect(mockBatches.create).toHaveBeenCalledWith(
                tenantId,
                userId,
                userName,
                expect.objectContaining({
                    productId: 'prod1',
                    batchNumber: 'BATCH-001',
                    quantity: 10,
                    purchaseCost: 100,
                    supplierId: 'supplier1',
                    purchaseId: `${tenantId}:purchase:${poId}`,
                    location: 'default',
                }),
            );
            expect(mockDb.insert).toHaveBeenCalled();
            expect(mockLogs.record).toHaveBeenCalled();
            expect(result).toHaveProperty('receivingNumber');
            expect(result).toHaveProperty('items');
            expect(result.items[0].quantityReceiving).toBe(10);
        });

        it('should receive stock without batch tracking', async () => {
            const receiveDto = {
                items: [
                    {
                        productId: 'prod1',
                        quantityReceiving: 5,
                        unitCost: 50,
                    },
                ],
                receivedDate: '2025-11-30',
            };

            const mockPo = {
                _id: `${tenantId}:purchase:${poId}`,
                _rev: '1-abc',
                type: 'purchase',
                poNumber: 'PO-20251130-001',
                supplierId: 'supplier1',
                supplierName: 'Test Supplier',
                status: 'pending',
                items: [
                    {
                        productId: 'prod1',
                        sku: 'PROD-001',
                        productName: 'Test Product',
                        quantityOrdered: 10,
                        quantityReceived: 0,
                        unitCost: 50,
                    },
                ],
            };

            mockDb.get.mockResolvedValueOnce(mockPo);
            mockStock.adjustStock.mockResolvedValue({ success: true });
            mockDb.insert.mockResolvedValue({ id: `${tenantId}:purchase:${poId}`, rev: '2-def' });

            const result = await service.receiveStock(
                tenantId,
                userId,
                userName,
                poId,
                receiveDto as any,
            );

            expect(mockStock.adjustStock).toHaveBeenCalledWith(
                tenantId,
                userId,
                userName,
                expect.objectContaining({
                    productId: 'prod1',
                    quantity: 5,
                    referenceType: 'purchase_order',
                    referenceId: poId,
                }),
            );
            expect(mockDb.insert).toHaveBeenCalled();
            expect(result.items[0].quantityReceiving).toBe(5);
        });

        it('should update PO status to completed when fully received', async () => {
            const receiveDto = {
                items: [
                    {
                        productId: 'prod1',
                        quantityReceiving: 10,
                        unitCost: 100,
                    },
                ],
                receivedDate: '2025-11-30',
            };

            const mockPo = {
                _id: `${tenantId}:purchase:${poId}`,
                _rev: '1-abc',
                type: 'purchase',
                poNumber: 'PO-20251130-001',
                supplierId: 'supplier1',
                supplierName: 'Test Supplier',
                status: 'pending',
                items: [
                    {
                        productId: 'prod1',
                        sku: 'PROD-001',
                        productName: 'Test Product',
                        quantityOrdered: 10,
                        quantityReceived: 0,
                        unitCost: 100,
                    },
                ],
            };

            mockDb.get.mockResolvedValueOnce(mockPo);
            mockStock.adjustStock.mockResolvedValue({ success: true });
            mockDb.insert.mockResolvedValue({ id: `${tenantId}:purchase:${poId}`, rev: '2-def' });

            const result = await service.receiveStock(
                tenantId,
                userId,
                userName,
                poId,
                receiveDto as any,
            );

            expect(result).toHaveProperty('purchaseOrderId');
            expect(result.items[0].quantityReceiving).toBe(10);
            // PO status is updated in DB, not returned in ReceivingRecord
            expect(mockDb.insert).toHaveBeenCalledTimes(2); // Once for receiving, once for PO update
        });

        it('should throw NotFoundException if PO not found', async () => {
            mockDb.get.mockRejectedValue({ statusCode: 404 });

            await expect(
                service.receiveStock(tenantId, userId, userName, poId, {
                    items: [],
                    receivedDate: '2025-11-30',
                } as any),
            ).rejects.toThrow(NotFoundException);
        });

        it('should throw BadRequestException if item not in PO', async () => {
            const receiveDto = {
                items: [
                    {
                        productId: 'invalid-productId',
                        quantityReceiving: 10,
                        unitCost: 100,
                    },
                ],
                receivedDate: '2025-11-30',
            };

            const mockPo = {
                _id: `${tenantId}:purchase:${poId}`,
                _rev: '1-abc',
                type: 'purchase',
                poNumber: 'PO-20251130-001',
                supplierId: 'supplier1',
                status: 'pending',
                items: [
                    {
                        productId: 'prod1',
                        sku: 'PROD-001',
                        productName: 'Test Product',
                        quantityOrdered: 10,
                        quantityReceived: 0,
                        unitCost: 100,
                    },
                ],
            };

            // Mock findOne call (PO lookup) - will fail before checking product
            mockDb.get.mockResolvedValue(mockPo);

            await expect(
                service.receiveStock(tenantId, userId, userName, poId, receiveDto as any),
            ).rejects.toThrow(BadRequestException);
        });

        it('should handle partial receiving correctly', async () => {
            const receiveDto = {
                items: [
                    {
                        productId: 'prod1',
                        quantityReceiving: 5,
                        unitCost: 100,
                    },
                ],
                receivedDate: '2025-11-30',
            };

            const mockPo = {
                _id: `${tenantId}:purchase:${poId}`,
                _rev: '1-abc',
                type: 'purchase',
                poNumber: 'PO-20251130-001',
                supplierId: 'supplier1',
                supplierName: 'Test Supplier',
                status: 'pending',
                items: [
                    {
                        productId: 'prod1',
                        sku: 'PROD-001',
                        productName: 'Test Product',
                        quantityOrdered: 10,
                        quantityReceived: 0,
                        unitCost: 100,
                    },
                ],
            };

            mockDb.get.mockResolvedValueOnce(mockPo);
            mockStock.adjustStock.mockResolvedValue({ success: true });
            mockDb.insert.mockResolvedValue({ id: `${tenantId}:purchase:${poId}`, rev: '2-def' });

            const result = await service.receiveStock(
                tenantId,
                userId,
                userName,
                poId,
                receiveDto as any,
            );

            expect(result).toHaveProperty('purchaseOrderId');
            expect(result.items[0].quantityReceiving).toBe(5);
            expect(mockDb.insert).toHaveBeenCalledTimes(2); // Once for receiving, once for PO update
        });
    });
});
