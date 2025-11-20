import { Injectable, Inject, ConflictException, NotFoundException } from '@nestjs/common';
import nano, { type DocumentScope } from 'nano';
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcrypt';
import { DATABASE_CONNECTION } from '../database/database.constants';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
    constructor(
        @Inject(DATABASE_CONNECTION) private readonly db: DocumentScope<any>,
    ) { }

    async create(tenantId: string, createUserDto: CreateUserDto) {
        const { email, password, name, role } = createUserDto;

        // 1. Check if user with this email already exists in the tenant
        const existing = await this.findByEmail(tenantId, email);
        if (existing) {
            throw new ConflictException(`User with email '${email}' already exists.`);
        }

        // 2. Hash the password
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // 3. Create the user document
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
            console.error(`CRITICAL: Found multiple users with the same email ${email} in tenant ${tenantId}`);
        }

        return result.docs[0] || null;
    }
}