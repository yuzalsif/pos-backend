import { BadRequestException, ConflictException } from '@nestjs/common';
import { UomsService } from './uoms.service';
import { CreateUomDto } from './dto/create-uom.dto';

describe('UomsService (unit)', () => {
    let uomsService: UomsService;
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

        uomsService = new UomsService(mockDb as any, mockLogs as any);
    });

    it('create should make the first UoM a base unit with toBaseFactor=1', async () => {
        // uniqueness check -> none
        mockDb.partitionedFind.mockResolvedValueOnce({ docs: [] });
        // all docs check -> none (first UoM)
        mockDb.partitionedFind.mockResolvedValueOnce({ docs: [] });

        mockDb.insert.mockResolvedValue({ id: 'tenant1:uom:1', rev: '1-abc' });

        const dto: CreateUomDto = { code: 'pc', name: 'piece' } as any;

        const res = await uomsService.create('tenant1', 'user:1', dto);

        expect(mockDb.insert).toHaveBeenCalled();
        // returned result should be base unit with toBaseFactor 1
        expect(res.baseUnit).toBe(true);
        expect(res.toBaseFactor).toBe(1);
        expect(res.baseUomId).toBeNull();
        // logs should be recorded
        expect(mockLogs.record).toHaveBeenCalledWith('tenant1', { userId: 'user:1' }, 'uom.create', 'uom', expect.any(String), { code: 'pc' });
    });

    it('create non-base should throw BadRequestException when baseUomId not found', async () => {
        // uniqueness check -> none
        mockDb.partitionedFind.mockResolvedValueOnce({ docs: [] });
        // all docs -> there is at least one, so not first UoM
        mockDb.partitionedFind.mockResolvedValueOnce({ docs: [{ _id: 'tenant1:uom:base' }] });

        // db.get for baseUomId will fail
        mockDb.get.mockRejectedValue({ statusCode: 404 });

        const dto: CreateUomDto = { code: 'box', name: 'Box', baseUnit: false, baseUomId: 'nonexistent', toBaseFactor: 10 } as any;

        await expect(uomsService.create('tenant1', 'user:2', dto)).rejects.toThrow(BadRequestException);
    });

    it('findAll should return list of uoms', async () => {
        const docs = [{ _id: 'tenant1:uom:1', code: 'pc' }, { _id: 'tenant1:uom:2', code: 'box' }];
        mockDb.partitionedFind.mockResolvedValue({ docs });

        const list = await uomsService.findAll('tenant1');
        expect(list).toEqual(docs);
    });

    it('create non-base should succeed when baseUomId exists and normalize baseUomId', async () => {
        // uniqueness check -> none
        mockDb.partitionedFind.mockResolvedValueOnce({ docs: [] });
        // all docs -> there is at least one existing uom so this is not first
        mockDb.partitionedFind.mockResolvedValueOnce({ docs: [{ _id: 'tenant1:uom:base' }] });

        // db.get should return a base UoM doc when called with normalized id
        mockDb.get.mockImplementation(async (id: string) => {
            if (id === 'tenant1:uom:base') return { _id: 'tenant1:uom:base', baseUnit: true };
            return {};
        });

        mockDb.insert.mockResolvedValue({ id: 'tenant1:uom:child', rev: '1-xyz' });

        const dto: any = { code: 'box', name: 'Box', baseUnit: false, baseUomId: 'base', toBaseFactor: 12 };

        const res = await uomsService.create('tenant1', 'user:9', dto);

        expect(mockDb.insert).toHaveBeenCalled();
        const inserted = mockDb.insert.mock.calls[0][0];
        // baseUomId should be normalized to full id
        expect(inserted.baseUomId).toBe('tenant1:uom:base');
        expect(inserted.baseUnit).toBe(false);
        expect(inserted.toBaseFactor).toBe(12);
        // createdBy should be set
        expect(inserted.createdBy).toEqual({ userId: 'user:9' });
        // logs should be recorded
        expect(mockLogs.record).toHaveBeenCalledWith('tenant1', { userId: 'user:9' }, 'uom.create', 'uom', expect.any(String), { code: 'box' });
    });
});
