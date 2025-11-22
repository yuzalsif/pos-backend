import { Injectable, Inject, ConflictException, NotFoundException, BadRequestException, InternalServerErrorException, Logger } from '@nestjs/common';
import nano, { type DocumentScope } from 'nano';
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcrypt';
import { DATABASE_CONNECTION } from '../database/database.constants';
import { CreateUserDto } from './dto/create-user.dto';
import { MailService } from './mail.service';
import { SignupDto } from './dto/signup.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Injectable()
export class UsersService {
    constructor(
        @Inject(DATABASE_CONNECTION) private readonly db: DocumentScope<any>,
        private readonly mailService?: MailService,
    ) { }

    private readonly logger = new Logger(UsersService.name);

    async create(tenantId: string, createUserDto: CreateUserDto) {
        const { email, password, name, role } = createUserDto;

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
            createdAt: now,
            updatedAt: now,
        };

        await this.db.insert(newUser);

        const { passwordHash: _, ...result } = newUser;
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

        return { user, tenantId, tenantCreated: createdTenant };
    }

    async signupManager(signup: SignupDto) {
        const { tenantId, email, password, name } = signup;

        if (!tenantId) {
            throw new BadRequestException({ key: 'user.manager_tenant_required' });
        }

        const createUserDto: CreateUserDto = { email, password, name, role: 'manager' } as any;
        return this.create(tenantId, createUserDto);
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

        return { ok: true };
    }
}