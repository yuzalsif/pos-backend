import { Injectable, Inject, ConflictException, NotFoundException, BadRequestException, InternalServerErrorException, Logger } from '@nestjs/common';
import nano, { type DocumentScope } from 'nano';
import { v4 as uuidv4 } from 'uuid';
import { DATABASE_CONNECTION } from '../database/database.constants';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
    private readonly logger = new Logger(ProductsService.name);
    constructor(
        @Inject(DATABASE_CONNECTION) private readonly db: DocumentScope<any>,
    ) { }

    async create(tenantId: string, userId: string, userName: string, createProductDto: CreateProductDto) {
        try {
            // 1. Check for SKU uniqueness within the tenant
            const existing = await this.db.partitionedFind(tenantId, {
                selector: { type: 'product', sku: createProductDto.sku },
            });
            if (existing.docs.length > 0) {
                throw new ConflictException({ key: 'product.sku_exists', vars: { sku: createProductDto.sku } });
            }

            // 2. Validate supplier if provided
            let normalizedSupplierId: string | null = null;
            if (createProductDto.supplierId) {
                normalizedSupplierId = createProductDto.supplierId.includes(':') ? createProductDto.supplierId : `${tenantId}:supplier:${createProductDto.supplierId}`;
                try {
                    await this.db.get(normalizedSupplierId);
                } catch (err) {
                    throw new BadRequestException({ key: 'supplier.not_found', vars: { supplierId: createProductDto.supplierId } });
                }
            }

            // 3. Validate and denormalize UoMs
            const denormUnits = [] as any[];
            for (const u of createProductDto.unitsOfMeasure) {
                if (!u.uomId) {
                    throw new BadRequestException({ key: 'product.uom_not_found' });
                }

                const fullUomId = u.uomId.includes(':') ? u.uomId : `${tenantId}:uom:${u.uomId}`;
                let uomDoc: any;
                try {
                    uomDoc = await this.db.get(fullUomId);
                } catch (err) {
                    throw new BadRequestException({ key: 'product.uom_not_found', vars: { uomId: u.uomId } });
                }

                const factor = typeof u.factor === 'number' ? u.factor : uomDoc.toBaseFactor;
                if (typeof factor !== 'number' || factor <= 0) {
                    throw new BadRequestException({ key: 'uom.invalid_factor' });
                }

                denormUnits.push({
                    uomId: fullUomId,
                    uomCode: uomDoc.code,
                    factor,
                    priceTiers: u.priceTiers,
                });
            }

            const now = new Date().toISOString();
            const newProduct = {
                _id: `${tenantId}:product:${uuidv4()}`,
                type: 'product',
                tenantId: tenantId,
                name: createProductDto.name,
                description: createProductDto.description ?? null,
                sku: createProductDto.sku,
                category: createProductDto.category ?? null,
                isActive: createProductDto.isActive,
                discountAmount: createProductDto.discountAmount ?? null,
                purchase: !!createProductDto.purchase,
                supplierId: normalizedSupplierId,
                unitsOfMeasure: denormUnits,
                createdAt: now,
                createdBy: { userId, name: userName },
                updatedAt: now,
                updatedBy: { userId, name: userName },
            };

            // 4. Insert into the database
            const response = await this.db.insert(newProduct);
            // Note: purchase registration will be implemented later. For now, return product info.
            return { id: response.id, rev: response.rev, ...newProduct };
        } catch (error) {
            if (error instanceof ConflictException || error instanceof BadRequestException || error instanceof NotFoundException) throw error;
            this.logger.error('Failed to create product', error as any);
            throw new InternalServerErrorException({ key: 'product.create_failed' });
        }
    }

    async update(tenantId: string, userId: string, userName: string, id: string, updateDto: UpdateProductDto) {
        try {
            const fullId = `${tenantId}:product:${id}`;
            let existing: any;
            try {
                existing = await this.db.get(fullId);
            } catch (err) {
                if ((err as any).statusCode === 404) {
                    throw new NotFoundException({ key: 'product.not_found', vars: { id } });
                }
                throw err;
            }

            // If SKU is changing, ensure uniqueness
            if (updateDto.sku && updateDto.sku !== existing.sku) {
                const found = await this.db.partitionedFind(tenantId, { selector: { type: 'product', sku: updateDto.sku } });
                if (found.docs.length > 0) {
                    throw new ConflictException({ key: 'product.sku_exists', vars: { sku: updateDto.sku } });
                }
            }

            // Validate supplier if provided
            let normalizedSupplierId: string | null = existing.supplierId ?? null;
            if (updateDto.supplierId !== undefined) {
                if (updateDto.supplierId) {
                    normalizedSupplierId = updateDto.supplierId.includes(':') ? updateDto.supplierId : `${tenantId}:supplier:${updateDto.supplierId}`;
                    try {
                        await this.db.get(normalizedSupplierId);
                    } catch (err) {
                        throw new BadRequestException({ key: 'supplier.not_found', vars: { supplierId: updateDto.supplierId } });
                    }
                } else {
                    normalizedSupplierId = null;
                }
            }

            // Validate/denormalize units if provided
            let denormUnits = existing.unitsOfMeasure;
            if (updateDto.unitsOfMeasure) {
                denormUnits = [];
                for (const u of updateDto.unitsOfMeasure) {
                    if (!u.uomId) {
                        throw new BadRequestException({ key: 'product.uom_not_found' });
                    }
                    const fullUomId = u.uomId.includes(':') ? u.uomId : `${tenantId}:uom:${u.uomId}`;
                    let uomDoc: any;
                    try {
                        uomDoc = await this.db.get(fullUomId);
                    } catch (err) {
                        throw new BadRequestException({ key: 'product.uom_not_found', vars: { uomId: u.uomId } });
                    }

                    const factor = typeof u.factor === 'number' ? u.factor : uomDoc.toBaseFactor;
                    if (typeof factor !== 'number' || factor <= 0) {
                        throw new BadRequestException({ key: 'uom.invalid_factor' });
                    }

                    denormUnits.push({
                        uomId: fullUomId,
                        uomCode: uomDoc.code,
                        factor,
                        priceTiers: u.priceTiers,
                    });
                }
            }

            const now = new Date().toISOString();

            const updated = {
                ...existing,
                ...updateDto,
                supplierId: normalizedSupplierId,
                unitsOfMeasure: denormUnits,
                updatedAt: now,
                updatedBy: { userId, name: userName },
            };

            const res = await this.db.insert(updated);
            return { id: res.id, rev: res.rev, ...updated };
        } catch (error) {
            if (error instanceof ConflictException || error instanceof BadRequestException || error instanceof NotFoundException) throw error;
            this.logger.error('Failed to update product', error as any);
            throw new InternalServerErrorException({ key: 'product.update_failed' });
        }
    }

    async findOne(tenantId: string, id: string) {
        try {
            const doc = await this.db.get(`${tenantId}:product:${id}`);
            return doc;
        } catch (error) {
            if (error.statusCode === 404) {
                throw new NotFoundException({ key: 'product.not_found', vars: { id } });
            }
            throw error;
        }
    }

    // TODO: Add findAll (with pagination), and delete methods
}