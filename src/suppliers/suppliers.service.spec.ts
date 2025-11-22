import { ConflictException, BadRequestException } from '@nestjs/common';
import { SuppliersService } from './suppliers.service';

describe('SuppliersService (unit)', () => {
    let suppliersService: SuppliersService;
    const mockDb: any = {
        partitionedFind: jest.fn(),
        insert: jest.fn(),
    };
    const mockLogs: any = { record: jest.fn() };

    beforeEach(() => {
        mockDb.partitionedFind.mockReset();
        mockDb.insert.mockReset();
        mockLogs.record.mockReset();

        suppliersService = new SuppliersService(mockDb as any, mockLogs as any);
    });

    it('create should throw BadRequestException when tenantId missing', async () => {
        await expect(suppliersService.create('', { name: 'A', phone: '123' } as any)).rejects.toThrow(BadRequestException);
    });

    it('create should throw ConflictException when duplicate found', async () => {
        mockDb.partitionedFind.mockResolvedValue({ docs: [{ _id: 't:supplier:1' }] });
        await expect(suppliersService.create('tenant1', { name: 'A', phone: '123' } as any)).rejects.toThrow(ConflictException);
        expect(mockDb.partitionedFind).toHaveBeenCalled();
    });

    it('create should insert supplier and return result', async () => {
        mockDb.partitionedFind.mockResolvedValue({ docs: [] });
        mockDb.insert.mockResolvedValue({ ok: true, id: 'tenant1:supplier:abc', rev: '1-xxx' });
        const res = await suppliersService.create('tenant1', { name: 'Sup', phone: '999', email: 's@x.com' } as any, 'creator:1');

        expect(mockDb.insert).toHaveBeenCalled();
        expect(res.name).toBe('Sup');
        expect(res.phone).toBe('999');
        expect(res.email).toBe('s@x.com');

        // ensure inserted doc carries createdBy value
        const inserted = mockDb.insert.mock.calls[0][0];
        expect(inserted.createdBy).toBe('creator:1');

        // assert logs recorded
        expect(mockLogs.record).toHaveBeenCalledTimes(1);
        expect(mockLogs.record).toHaveBeenCalledWith(
            'tenant1',
            { userId: 'creator:1' },
            'supplier.create',
            'supplier',
            expect.stringContaining('tenant1:supplier:'),
            { name: 'Sup', phone: '999', email: 's@x.com' },
        );
    });

    it("create without createdBy should record log with actor 'system'", async () => {
        mockDb.partitionedFind.mockResolvedValue({ docs: [] });
        mockDb.insert.mockResolvedValue({ ok: true, id: 'tenant1:supplier:def', rev: '1-yyy' });

        const res = await suppliersService.create('tenant1', { name: 'SysSup', phone: '111' } as any);

        expect(mockDb.insert).toHaveBeenCalled();
        expect(res.name).toBe('SysSup');

        expect(mockLogs.record).toHaveBeenCalledTimes(1);
        expect(mockLogs.record).toHaveBeenCalledWith(
            'tenant1',
            { userId: 'system' },
            'supplier.create',
            'supplier',
            expect.stringContaining('tenant1:supplier:'),
            { name: 'SysSup', phone: '111', email: undefined },
        );
    });

    it('findAll should return supplier docs list', async () => {
        const docs = [{ _id: 'tenant1:supplier:1', name: 'S1' }, { _id: 'tenant1:supplier:2', name: 'S2' }];
        mockDb.partitionedFind.mockResolvedValue({ docs });

        const list = await suppliersService.findAll('tenant1');
        expect(list).toEqual(docs);
    });
});
