import { ConflictException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { DEFAULT_ROLE_PERMISSIONS, Permission } from '../auth/permissions.enum';
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

    describe('Default permissions assignment', () => {
        beforeEach(() => {
            mockDb.partitionedFind.mockResolvedValue({ docs: [] });
            mockDb.insert.mockImplementation(async (doc: any) => ({ id: doc._id, rev: '1-' }));
        });

        it('should assign owner default permissions when role is owner and no permissions provided', async () => {
            const result = await usersService.create('tenant1', {
                email: 'owner@test.com',
                password: 'password123',
                name: 'Owner User',
                role: 'owner'
            } as any);

            expect(mockDb.insert).toHaveBeenCalled();
            const insertedDoc = mockDb.insert.mock.calls[0][0];
            expect(insertedDoc.permissions).toEqual(DEFAULT_ROLE_PERMISSIONS.owner);
            expect(insertedDoc.permissions).toContain(Permission.SALES_CREATE);
            expect(insertedDoc.permissions).toContain(Permission.USERS_CREATE);
            expect(insertedDoc.permissions.length).toBeGreaterThan(0);
        });

        it('should assign manager default permissions when role is manager and no permissions provided', async () => {
            const result = await usersService.create('tenant1', {
                email: 'manager@test.com',
                password: 'password123',
                name: 'Manager User',
                role: 'manager'
            } as any);

            expect(mockDb.insert).toHaveBeenCalled();
            const insertedDoc = mockDb.insert.mock.calls[0][0];
            expect(insertedDoc.permissions).toEqual(DEFAULT_ROLE_PERMISSIONS.manager);
            expect(insertedDoc.permissions).toContain(Permission.SALES_CREATE);
            expect(insertedDoc.permissions).toContain(Permission.PRODUCTS_CREATE);
            expect(insertedDoc.permissions.length).toBeGreaterThan(0);
        });

        it('should assign attendant default permissions when role is attendant and no permissions provided', async () => {
            const result = await usersService.create('tenant1', {
                email: 'attendant@test.com',
                password: 'password123',
                name: 'Attendant User',
                role: 'attendant'
            } as any);

            expect(mockDb.insert).toHaveBeenCalled();
            const insertedDoc = mockDb.insert.mock.calls[0][0];
            expect(insertedDoc.permissions).toEqual(DEFAULT_ROLE_PERMISSIONS.attendant);
            expect(insertedDoc.permissions).toContain(Permission.SALES_CREATE);
            expect(insertedDoc.permissions).toContain(Permission.SALES_VIEW);
            expect(insertedDoc.permissions).toContain(Permission.PRODUCTS_VIEW);
        });

        it('should use provided permissions instead of defaults when permissions are explicitly provided', async () => {
            const customPermissions = [Permission.SALES_CREATE, Permission.PURCHASES_VIEW];

            const result = await usersService.create('tenant1', {
                email: 'custom@test.com',
                password: 'password123',
                name: 'Custom User',
                role: 'attendant',
                permissions: customPermissions
            } as any);

            expect(mockDb.insert).toHaveBeenCalled();
            const insertedDoc = mockDb.insert.mock.calls[0][0];
            expect(insertedDoc.permissions).toEqual(customPermissions);
            expect(insertedDoc.permissions).not.toEqual(DEFAULT_ROLE_PERMISSIONS.attendant);
        });
    });

    describe('update', () => {
        const mockActor = { userId: 'actor:1', name: 'Actor' };

        beforeEach(() => {
            mockDb.partitionedFind.mockResolvedValue({ docs: [] });
        });

        it('should throw NotFoundException when user does not exist', async () => {
            mockDb.get.mockRejectedValue({ statusCode: 404 });

            await expect(
                usersService.update('tenant1', 'user:1', { name: 'NewName' }, mockActor)
            ).rejects.toThrow(NotFoundException);
        });

        it('should update user name', async () => {
            const existingUser = {
                _id: 'tenant1:user:1',
                email: 'user@test.com',
                name: 'Old Name',
                role: 'attendant',
                permissions: DEFAULT_ROLE_PERMISSIONS.attendant,
                passwordHash: 'hash',
            };
            mockDb.get.mockResolvedValue(existingUser);
            mockDb.insert.mockResolvedValue({ ok: true });

            const result = await usersService.update('tenant1', 'user:1', { name: 'New Name' }, mockActor);

            expect(mockDb.insert).toHaveBeenCalled();
            const updatedDoc = mockDb.insert.mock.calls[0][0];
            expect(updatedDoc.name).toBe('New Name');
            expect(updatedDoc.updatedBy).toEqual(mockActor);
        });

        it('should update user email after checking for conflicts', async () => {
            const existingUser = {
                _id: 'tenant1:user:1',
                email: 'old@test.com',
                name: 'User',
                role: 'attendant',
                permissions: [],
                passwordHash: 'hash',
            };
            mockDb.get.mockResolvedValue(existingUser);
            mockDb.insert.mockResolvedValue({ ok: true });

            const result = await usersService.update('tenant1', 'user:1', { email: 'new@test.com' }, mockActor);

            expect(mockDb.partitionedFind).toHaveBeenCalled(); // Check for email conflict
            expect(mockDb.insert).toHaveBeenCalled();
            const updatedDoc = mockDb.insert.mock.calls[0][0];
            expect(updatedDoc.email).toBe('new@test.com');
        });

        it('should throw ConflictException when new email already exists', async () => {
            const existingUser = {
                _id: 'tenant1:user:1',
                email: 'old@test.com',
                name: 'User',
                role: 'attendant',
                permissions: [],
                passwordHash: 'hash',
            };
            mockDb.get.mockResolvedValue(existingUser);
            mockDb.partitionedFind.mockResolvedValue({ docs: [{ _id: 'tenant1:user:2' }] }); // Another user with this email

            await expect(
                usersService.update('tenant1', 'user:1', { email: 'taken@test.com' }, mockActor)
            ).rejects.toThrow(ConflictException);
        });

        it('should update password with hash', async () => {
            const existingUser = {
                _id: 'tenant1:user:1',
                email: 'user@test.com',
                name: 'User',
                role: 'attendant',
                permissions: [],
                passwordHash: 'oldHash',
            };
            mockDb.get.mockResolvedValue(existingUser);
            mockDb.insert.mockResolvedValue({ ok: true });

            await usersService.update('tenant1', 'user:1', { password: 'newPassword123' }, mockActor);

            const updatedDoc = mockDb.insert.mock.calls[0][0];
            expect(updatedDoc.passwordHash).not.toBe('oldHash');
            expect(updatedDoc.passwordHash).not.toBe('newPassword123'); // Should be hashed
        });

        it('should update role and reset permissions to role defaults when permissions not provided', async () => {
            const existingUser = {
                _id: 'tenant1:user:1',
                email: 'user@test.com',
                name: 'User',
                role: 'attendant',
                permissions: [Permission.SALES_CREATE],
                passwordHash: 'hash',
            };
            mockDb.get.mockResolvedValue(existingUser);
            mockDb.insert.mockResolvedValue({ ok: true });

            await usersService.update('tenant1', 'user:1', { role: 'manager' }, mockActor);

            const updatedDoc = mockDb.insert.mock.calls[0][0];
            expect(updatedDoc.role).toBe('manager');
            expect(updatedDoc.permissions).toEqual(DEFAULT_ROLE_PERMISSIONS.manager);
        });

        it('should update role and keep custom permissions when permissions explicitly provided', async () => {
            const existingUser = {
                _id: 'tenant1:user:1',
                email: 'user@test.com',
                name: 'User',
                role: 'attendant',
                permissions: [Permission.SALES_CREATE],
                passwordHash: 'hash',
            };
            mockDb.get.mockResolvedValue(existingUser);
            mockDb.insert.mockResolvedValue({ ok: true });

            const customPermissions = [Permission.PURCHASES_CREATE, Permission.PURCHASES_VIEW];
            await usersService.update('tenant1', 'user:1', { role: 'manager', permissions: customPermissions }, mockActor);

            const updatedDoc = mockDb.insert.mock.calls[0][0];
            expect(updatedDoc.role).toBe('manager');
            expect(updatedDoc.permissions).toEqual(customPermissions);
        });

        it('should update only permissions without changing role', async () => {
            const existingUser = {
                _id: 'tenant1:user:1',
                email: 'user@test.com',
                name: 'User',
                role: 'attendant',
                permissions: DEFAULT_ROLE_PERMISSIONS.attendant,
                passwordHash: 'hash',
            };
            mockDb.get.mockResolvedValue(existingUser);
            mockDb.insert.mockResolvedValue({ ok: true });

            const newPermissions = [Permission.SALES_CREATE, Permission.PURCHASES_CREATE];
            await usersService.update('tenant1', 'user:1', { permissions: newPermissions }, mockActor);

            const updatedDoc = mockDb.insert.mock.calls[0][0];
            expect(updatedDoc.role).toBe('attendant');
            expect(updatedDoc.permissions).toEqual(newPermissions);
        });
    });
});
