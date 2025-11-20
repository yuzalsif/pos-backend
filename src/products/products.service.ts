import { Injectable, Inject, ConflictException, NotFoundException } from '@nestjs/common';
import nano, { type DocumentScope } from 'nano';
import { v4 as uuidv4 } from 'uuid';
import { DATABASE_CONNECTION } from '../database/database.constants';
import { CreateProductDto } from './dto/create-product.dto';

@Injectable()
export class ProductsService {
    constructor(
        @Inject(DATABASE_CONNECTION) private readonly db: DocumentScope<any>,
    ) { }

    async create(tenantId: string, userId: string, userName: string, createProductDto: CreateProductDto) {
        // 1. Check for SKU uniqueness within the tenant
        const existing = await this.db.partitionedFind(tenantId, {
            selector: { type: 'product', sku: createProductDto.sku },
        });
        if (existing.docs.length > 0) {
            throw new ConflictException(`Product with SKU '${createProductDto.sku}' already exists.`);
        }

        // 2. Construct the new document
        const now = new Date().toISOString();
        const newProduct = {
            _id: `${tenantId}:product:${uuidv4()}`,
            type: 'product',
            tenantId: tenantId,
            ...createProductDto,
            createdAt: now,
            createdBy: { userId, name: userName },
            updatedAt: now,
            updatedBy: { userId, name: userName },
        };

        // 3. Insert into the database
        const response = await this.db.insert(newProduct);
        return { id: response.id, rev: response.rev, ...newProduct };
    }

    async findOne(tenantId: string, id: string) {
        try {
            const doc = await this.db.get(`${tenantId}:product:${id}`);
            return doc;
        } catch (error) {
            if (error.statusCode === 404) {
                throw new NotFoundException(`Product with ID '${id}' not found.`);
            }
            throw error;
        }
    }

    // TODO: Add findAll (with pagination), update, and delete methods
}