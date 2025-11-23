import { Injectable, Inject, ConflictException, NotFoundException, BadRequestException, InternalServerErrorException, Logger } from '@nestjs/common';
import nano, { type DocumentScope } from 'nano';
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcrypt';
import { DATABASE_CONNECTION } from '../database/database.constants';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { MailService } from './mail.service';
import { SignupDto } from './dto/signup.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { DEFAULT_ROLE_PERMISSIONS } from '../auth/permissions.enum';

@Injectable()
export class UsersService {
    constructor(
        @Inject(DATABASE_CONNECTION) private readonly db: DocumentScope<any>,
        private readonly mailService?: MailService,
        private readonly logsService?: any,
    ) { }

    private readonly logger = new Logger(UsersService.name);

    async create(tenantId: string, createUserDto: CreateUserDto, actor?: { userId?: string; name?: string }) {
        const { email, password, name, role, permissions } = createUserDto;

        const existing = await this.findByEmail(tenantId, email);
        if (existing) {
            throw new ConflictException({ key: 'user.email_exists', vars: { email } });
        }

        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        const now = new Date().toISOString();
        const newUser = {
            _id: `${tenantId}:user:${uuidv4()}`,
            type: 'user',
            tenantId: tenantId,
            email,
            passwordHash,
            name,
            role,
            permissions: permissions || DEFAULT_ROLE_PERMISSIONS[role] || [],
            createdAt: now,
            createdBy: actor ? { userId: actor.userId, name: actor.name } : null,
            updatedAt: now,
            updatedBy: actor ? { userId: actor.userId, name: actor.name } : null,
        };

        await this.db.insert(newUser);

        const { passwordHash: _, ...result } = newUser;

        // record audit log (best-effort) only when an actor is present (caller created the user)
        try {
            if (this.logsService && actor && actor.userId) {
                await this.logsService.record(tenantId, { userId: actor.userId, name: actor.name }, 'user.create', 'user', result._id, { role: result.role });
            }
        } catch (e) {
            this.logger.warn('Failed to record user.create log', e as any);
        }

        return result;
    }

    async findByEmail(tenantId: string, email: string) {
        const query = { selector: { type: 'user', email: email } };
        const result = await this.db.partitionedFind(tenantId, query);

        if (result.docs.length > 1) {
            this.logger.error(`CRITICAL: Found multiple users with the same email ${email} in tenant ${tenantId}`);
        }

        return result.docs[0] || null;
    }

    async update(tenantId: string, userId: string, updateUserDto: UpdateUserDto, actor: { userId: string; name: string }) {
        const { email, password, name, role, permissions } = updateUserDto;

        // Get existing user
        const userDocId = `${tenantId}:user:${userId}`;
        let userDoc;
        try {
            userDoc = await this.db.get(userDocId);
        } catch (err: any) {
            if (err.statusCode === 404) {
                throw new NotFoundException({ key: 'user.not_found', vars: { userId } });
            }
            throw new InternalServerErrorException('user.get_failed');
        }

        // Check if email is being changed and if it already exists
        if (email && email !== userDoc.email) {
            const existing = await this.findByEmail(tenantId, email);
            if (existing) {
                throw new ConflictException({ key: 'user.email_exists', vars: { email } });
            }
            userDoc.email = email;
        }

        // Update password if provided
        if (password) {
            const saltRounds = 10;
            userDoc.passwordHash = await bcrypt.hash(password, saltRounds);
        }

        // Update other fields
        if (name) userDoc.name = name;
        if (role) {
            userDoc.role = role;
            // If role changes and permissions not explicitly provided, reset to role defaults
            if (permissions === undefined) {
                userDoc.permissions = DEFAULT_ROLE_PERMISSIONS[role] || [];
            }
        }
        if (permissions !== undefined) {
            userDoc.permissions = permissions;
        }

        userDoc.updatedAt = new Date().toISOString();
        userDoc.updatedBy = { userId: actor.userId, name: actor.name };

        try {
            await this.db.insert(userDoc);
        } catch (err) {
            this.logger.error('Failed to update user', err as any);
            throw new InternalServerErrorException('user.update_failed');
        }

        const { passwordHash: _, ...result } = userDoc;

        // Record audit log (best-effort)
        try {
            if (this.logsService) {
                await this.logsService.record(tenantId, actor, 'user.update', 'user', result._id, {
                    updatedFields: Object.keys(updateUserDto),
                });
            }
        } catch (e) {
            this.logger.warn('Failed to record user.update log', e as any);
        }

        return result;
    }

    private async ownerExists(tenantId: string) {
        if (!tenantId) return false;
        const query = { selector: { type: 'user', role: 'owner' } };
        const result = await this.db.partitionedFind(tenantId, query);
        return (result.docs && result.docs.length > 0);
    }

    async signupOwner(signup: SignupDto) {
        let { tenantId, email, password, name } = signup;

        let createdTenant = false;
        if (!tenantId) {
            tenantId = uuidv4();
            createdTenant = true;
            const tenantDoc = {
                _id: `tenant:${tenantId}`,
                type: 'tenant',
                tenantId,
                createdAt: new Date().toISOString(),
            };

            try {
                await this.db.insert(tenantDoc);
            } catch (err) {
                this.logger.error('Failed to create tenant doc', err as any);
                throw new InternalServerErrorException('tenant.create_failed');
            }
        }

        if (await this.ownerExists(tenantId)) {
            throw new ConflictException({ key: 'tenant.owner_exists', vars: { tenantId } });
        }

        const createUserDto: CreateUserDto = { email, password, name, role: 'owner' } as any;
        const user = await this.create(tenantId, createUserDto);

        // record tenant create and user create logs (best-effort)
        try {
            if (this.logsService) {
                // tenant created by system during signup
                if (createdTenant) {
                    await this.logsService.record(tenantId, { userId: 'system' }, 'tenant.create', 'tenant', `tenant:${tenantId}`, { tenantId });
                }
                // user created (owner)
                await this.logsService.record(tenantId, { userId: user._id, name: user.name }, 'user.create', 'user', user._id, { role: 'owner' });
            }
        } catch (e) {
            this.logger.warn('Failed to record signupOwner logs', e as any);
        }

        return { user, tenantId, tenantCreated: createdTenant };
    }

    async signupManager(signup: SignupDto) {
        const { tenantId, email, password, name } = signup;

        if (!tenantId) {
            throw new BadRequestException({ key: 'user.manager_tenant_required' });
        }

        const createUserDto: CreateUserDto = { email, password, name, role: 'manager' } as any;
        const user = await this.create(tenantId, createUserDto);

        try {
            if (this.logsService) {
                await this.logsService.record(tenantId, { userId: user._id, name: user.name }, 'user.create', 'user', user._id, { role: 'manager' });
            }
        } catch (e) {
            this.logger.warn('Failed to record signupManager log', e as any);
        }

        return user;
    }

    async forgotPassword(payload: ForgotPasswordDto) {
        const { tenantId, email } = payload;
        const user = await this.findByEmail(tenantId, email);

        if (!user) {
            return { ok: true };
        }

        const token = uuidv4();
        const expiry = Date.now() + 1000 * 60 * 60; // 1 hour

        const doc = await this.db.get(user._id);
        doc.resetToken = token;
        doc.resetTokenExpiry = expiry;
        doc.updatedAt = new Date().toISOString();
        await this.db.insert(doc);

        try {
            if (this.mailService) await this.mailService.sendResetPasswordEmail(email, tenantId, token, user.locale || 'en', user.name);
        } catch (err) {
            this.logger.error('Failed to send reset password email', err as any);
        }

        // record forgot password log (best-effort)
        try {
            if (this.logsService) {
                await this.logsService.record(tenantId, { userId: user._id, name: user.name }, 'user.forgot_password', 'user', user._id);
            }
        } catch (e) {
            this.logger.warn('Failed to record forgot password log', e as any);
        }

        return { ok: true };
    }

    async resetPassword(payload: ResetPasswordDto) {
        const { tenantId, token, newPassword } = payload;

        const query = { selector: { type: 'user', resetToken: token } };
        const result = await this.db.partitionedFind(tenantId, query);
        if (!result.docs || result.docs.length === 0) {
            throw new BadRequestException({ key: 'auth.invalid_token' });
        }

        const user = result.docs[0];
        if (!user.resetTokenExpiry || user.resetTokenExpiry < Date.now()) {
            throw new BadRequestException({ key: 'auth.invalid_token' });
        }

        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(newPassword, saltRounds);

        const doc = await this.db.get(user._id);
        doc.passwordHash = passwordHash;
        delete doc.resetToken;
        delete doc.resetTokenExpiry;
        doc.updatedAt = new Date().toISOString();

        await this.db.insert(doc);

        // record reset password log (best-effort)
        try {
            if (this.logsService) {
                await this.logsService.record(tenantId, { userId: user._id, name: user.name }, 'user.reset_password', 'user', user._id);
            }
        } catch (e) {
            this.logger.warn('Failed to record reset password log', e as any);
        }

        return { ok: true };
    }
}