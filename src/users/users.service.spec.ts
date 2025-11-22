import { ConflictException } from '@nestjs/common';
import { UsersService } from './users.service';
import * as bcrypt from 'bcrypt';

describe('UsersService (unit)', () => {
    let usersService: UsersService;
    const mockDb: any = {
        partitionedFind: jest.fn(),
        insert: jest.fn(),
        get: jest.fn(),
    };

    const mockLogs = { record: jest.fn() };

    beforeEach(() => {
        mockDb.partitionedFind.mockReset();
        mockDb.insert.mockReset();
        mockDb.get.mockReset();
        mockLogs.record.mockReset();

        usersService = new UsersService(mockDb as any, undefined, mockLogs as any);
    });

    it('create should throw ConflictException when email exists', async () => {
        mockDb.partitionedFind.mockResolvedValue({ docs: [{ _id: 't:user:1' }] });

        await expect(
            usersService.create('tenant1', { email: 'a@b.com', password: 'p', name: 'n', role: 'owner' } as any),
        ).rejects.toThrow(ConflictException);
        expect(mockDb.partitionedFind).toHaveBeenCalled();
    });

    it('create should insert user and set createdBy when actor provided', async () => {
        // no existing user
        mockDb.partitionedFind.mockResolvedValue({ docs: [] });
        // simulate insert returning id
        mockDb.insert.mockImplementation(async (doc: any) => ({ id: doc._id, rev: '1-' }));

        // allow bcrypt.hash to run (real implementation) — acceptable for this unit test

        const actor = { userId: 'actor:1', name: 'Act' };

        const result = await usersService.create('tenantX', { email: 'u@x.com', password: 'p', name: 'UserX', role: 'manager' } as any, actor as any);

        // db.insert called
        expect(mockDb.insert).toHaveBeenCalled();

        // inserted doc had createdBy set to actor
        const insertedArg = mockDb.insert.mock.calls[0][0];
        expect(insertedArg.createdBy).toEqual({ userId: actor.userId, name: actor.name });

        // logsService.record should have been called with actor as the actor
        expect(mockLogs.record).toHaveBeenCalledWith(
            'tenantX',
            { userId: actor.userId, name: actor.name },
            'user.create',
            'user',
            expect.any(String),
            expect.any(Object),
        );

        // result should include tenant and email
        expect(result.email).toBe('u@x.com');
        // no spy to restore
    });

    it('create without actor should not record logs and createdBy should be null', async () => {
        mockDb.partitionedFind.mockResolvedValue({ docs: [] });
        mockDb.insert.mockImplementation(async (doc: any) => ({ id: doc._id, rev: '1-' }));

        const result = await usersService.create('tenantZ', { email: 'noactor@x.com', password: 'p', name: 'NoActor', role: 'manager' } as any);

        expect(mockDb.insert).toHaveBeenCalled();
        const inserted = mockDb.insert.mock.calls[0][0];
        expect(inserted.createdBy).toBeNull();
        expect(mockLogs.record).not.toHaveBeenCalled();
        expect(result.email).toBe('noactor@x.com');
    });

    it('signupOwner with existing tenantId should record a single user.create log (no duplication)', async () => {
        // ownerExists -> no owner
        mockDb.partitionedFind.mockResolvedValue({ docs: [] });
        // create user insert
        mockDb.insert.mockResolvedValue({ id: 'tenantA:user:1', rev: '1-0' });

        const res = await usersService.signupOwner({ tenantId: 'tenantA', email: 'owner@a.com', password: 'p', name: 'Owner' } as any);

        // signupOwner should return user and tenantId
        expect(res).toHaveProperty('user');
        // logs should have been called exactly once for user.create (tenant.create not called because tenant provided)
        expect(mockLogs.record).toHaveBeenCalledTimes(1);
        expect(mockLogs.record).toHaveBeenCalledWith(
            'tenantA',
            { userId: expect.any(String), name: 'Owner' },
            'user.create',
            'user',
            expect.any(String),
            expect.any(Object),
        );
    });
});
