import { Injectable, Inject, ConflictException, NotFoundException, BadRequestException, InternalServerErrorException, Logger } from '@nestjs/common';
import nano, { type DocumentScope } from 'nano';
import { v4 as uuidv4 } from 'uuid';
import { DATABASE_CONNECTION } from '../database/database.constants';
import { CreateBatchDto } from './dto/create-batch.dto';

@Injectable()
export class BatchesService {
    private readonly logger = new Logger(BatchesService.name);

    constructor(
        @Inject(DATABASE_CONNECTION) private readonly db: DocumentScope<any>,
        @Inject('LogsService') private readonly logsService?: any,
    ) { }

    async create(tenantId: string, userId: string, userName: string, createDto: CreateBatchDto) {
        try {
            // 1. Validate product exists
            const productId = createDto.productId.includes(':') ? createDto.productId : `${tenantId}:product:${createDto.productId}`;
            let product: any;
            try {
                product = await this.db.get(productId);
            } catch (err) {
                if ((err as any).statusCode === 404) {
                    throw new NotFoundException({ key: 'product.not_found', vars: { productId: createDto.productId } });
                }
                throw err;
            }

            // 2. Check batch number uniqueness for this product
            const existing = await this.db.partitionedFind(tenantId, {
                selector: {
                    type: 'batch',
                    productId: productId,
                    batchNumber: createDto.batchNumber
                },
                limit: 1
            });

            if (existing.docs.length > 0) {
                throw new ConflictException({ key: 'batch.already_exists', vars: { batchNumber: createDto.batchNumber } });
            }

            // 3. Get product's default price tiers if not overriding
            let priceTiers = createDto.priceTiers;
            if (!createDto.priceOverride && product.unitsOfMeasure && product.unitsOfMeasure.length > 0) {
                // Use first UoM's price tiers as default
                priceTiers = product.unitsOfMeasure[0].priceTiers;
            }

            const now = new Date().toISOString();
            const newBatch = {
                _id: `${tenantId}:batch:${uuidv4()}`,
                type: 'batch',
                tenantId: tenantId,
                productId: productId,
                productSku: product.sku,
                batchNumber: createDto.batchNumber,
                supplierBatchNumber: createDto.supplierBatchNumber ?? null,

                // Quantity tracking
                quantityReceived: createDto.quantity,
                quantityAvailable: createDto.quantity,
                quantitySold: 0,
                quantityDamaged: 0,
                quantityReserved: 0,

                // Cost and pricing
                purchaseCost: createDto.purchaseCost,
                totalCost: createDto.purchaseCost * createDto.quantity,
                priceTiers: priceTiers,
                priceOverride: createDto.priceOverride ?? false,

                // Dates
                manufactureDate: createDto.manufactureDate ?? null,
                expiryDate: createDto.expiryDate ?? null,
                receivedDate: now,

                // References
                supplierId: createDto.supplierId ?? null,
                purchaseId: createDto.purchaseId ?? null,
                location: createDto.location ?? 'default',

                // Status
                status: 'active', // active, expired, recalled, depleted

                createdAt: now,
                createdBy: { userId, name: userName },
                updatedAt: now,
                updatedBy: { userId, name: userName },
            };

            const response = await this.db.insert(newBatch);
            const result = { ...newBatch, _rev: response.rev };

            // Record log
            try {
                if (this.logsService) {
                    await this.logsService.record(tenantId, { userId, name: userName }, 'batch.create', 'batch', result._id, {
                        batchNumber: createDto.batchNumber,
                        quantity: createDto.quantity,
                    });
                }
            } catch (e) {
                this.logger.warn('Failed to record batch.create log', e as any);
            }

            return result;
        } catch (error) {
            if (error instanceof ConflictException || error instanceof NotFoundException || error instanceof BadRequestException) {
                throw error;
            }
            this.logger.error('Failed to create batch', error as any);
            throw new InternalServerErrorException({ key: 'batch.create_failed' });
        }
    }

    async findAvailable(tenantId: string, productId: string) {
        try {
            const fullProductId = productId.includes(':') ? productId : `${tenantId}:product:${productId}`;

            const result = await this.db.partitionedFind(tenantId, {
                selector: {
                    type: 'batch',
                    productId: fullProductId,
                    status: 'active',
                    quantityAvailable: { $gt: 0 }
                },
                sort: [{ expiryDate: 'asc' }] // FIFO - oldest expiry first
            });

            return result.docs;
        } catch (error) {
            this.logger.error('Failed to find available batches', error as any);
            throw new InternalServerErrorException({ key: 'batch.query_failed' });
        }
    }

    async findExpiring(tenantId: string, withinDays: number = 30) {
        try {
            const now = new Date();
            const futureDate = new Date();
            futureDate.setDate(now.getDate() + withinDays);

            const result = await this.db.partitionedFind(tenantId, {
                selector: {
                    type: 'batch',
                    status: 'active',
                    quantityAvailable: { $gt: 0 },
                    expiryDate: {
                        $gte: now.toISOString(),
                        $lte: futureDate.toISOString()
                    }
                },
                sort: [{ expiryDate: 'asc' }]
            });

            return result.docs;
        } catch (error) {
            this.logger.error('Failed to find expiring batches', error as any);
            throw new InternalServerErrorException({ key: 'batch.query_failed' });
        }
    }

    async findAll(tenantId: string, productId?: string) {
        try {
            const selector: any = { type: 'batch' };
            if (productId) {
                selector.productId = productId.includes(':') ? productId : `${tenantId}:product:${productId}`;
            }

            const result = await this.db.partitionedFind(tenantId, { selector });
            return result.docs;
        } catch (error) {
            this.logger.error('Failed to list batches', error as any);
            throw new InternalServerErrorException({ key: 'batch.list_failed' });
        }
    }

    async findOne(tenantId: string, id: string) {
        try {
            const doc = await this.db.get(`${tenantId}:batch:${id}`);
            return doc;
        } catch (error) {
            if ((error as any).statusCode === 404) {
                throw new NotFoundException({ key: 'batch.not_found', vars: { id } });
            }
            throw error;
        }
    }
}
