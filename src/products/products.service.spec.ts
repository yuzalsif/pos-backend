import { ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { ProductsService } from './products.service';

describe('ProductsService (unit)', () => {
    let productsService: ProductsService;
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

        productsService = new ProductsService(mockDb as any, mockLogs as any);
    });

    it('create should throw ConflictException when SKU exists', async () => {
        mockDb.partitionedFind.mockResolvedValue({ docs: [{ _id: 't:product:1' }] });

        await expect(
            productsService.create('tenant1', 'user:1', 'User', {
                name: 'P',
                sku: 'SKU1',
                isActive: true,
                unitsOfMeasure: [
                    { uomId: 'u1', priceTiers: { retail: 100, wholesale: 90, dealer: 80 } },
                ],
            } as any),
        ).rejects.toThrow(ConflictException);
    });

    it('create should throw BadRequestException when supplier not found', async () => {
        // SKU check passes
        mockDb.partitionedFind.mockResolvedValue({ docs: [] });
        // supplier lookup will throw (not found)
        mockDb.get.mockImplementation(async (id: string) => {
            if (id.includes(':supplier:')) throw { statusCode: 404 };
            return {};
        });

        await expect(
            productsService.create('tenantX', 'u:1', 'User', {
                name: 'P2',
                sku: 'SKU2',
                isActive: true,
                supplierId: 's1',
                unitsOfMeasure: [
                    { uomId: 'u1', priceTiers: { retail: 100, wholesale: 90, dealer: 80 } },
                ],
            } as any),
        ).rejects.toThrow(BadRequestException);
    });

    it('create should denormalize uom, insert product, and record log', async () => {
        mockDb.partitionedFind.mockResolvedValue({ docs: [] });

        const uomDoc = { _id: 'tenantX:uom:u1', code: 'U1', toBaseFactor: 1 };
        mockDb.get.mockImplementation(async (id: string) => {
            if (id === 'tenantX:uom:u1') return uomDoc;
            // fallback
            return {};
        });

        mockDb.insert.mockResolvedValue({ id: 'tenantX:product:abc', rev: '1-zzz' });

        const dto: any = {
            name: 'Widget',
            sku: 'W-100',
            isActive: true,
            unitsOfMeasure: [{ uomId: 'u1', priceTiers: { retail: 1000, wholesale: 900, dealer: 800 } }],
        };

        const res = await productsService.create('tenantX', 'actor:1', 'Actor Name', dto);

        expect(mockDb.insert).toHaveBeenCalledTimes(1);
        // ensure logs recorded
        expect(mockLogs.record).toHaveBeenCalledWith('tenantX', { userId: 'actor:1', name: 'Actor Name' }, 'product.create', 'product', 'tenantX:product:abc', { sku: 'W-100' });

        // verify inserted doc had denormalized unit
        const inserted = mockDb.insert.mock.calls[0][0];
        expect(inserted.unitsOfMeasure).toHaveLength(1);
        expect(inserted.unitsOfMeasure[0].uomId).toBe('tenantX:uom:u1');
        expect(inserted.unitsOfMeasure[0].uomCode).toBe('U1');
        expect(inserted.unitsOfMeasure[0].priceTiers.retail).toBe(1000);
        // createdBy/updatedBy should reflect the actor passed in
        expect(inserted.createdBy).toEqual({ userId: 'actor:1', name: 'Actor Name' });
        expect(inserted.updatedBy).toEqual({ userId: 'actor:1', name: 'Actor Name' });
        expect(typeof inserted.createdAt).toBe('string');
    });
});
