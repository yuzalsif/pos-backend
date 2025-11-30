import {
    Injectable,
    Inject,
    NotFoundException,
    BadRequestException,
    ConflictException,
    InternalServerErrorException,
} from '@nestjs/common';
import type { DocumentScope } from 'nano';
import { v4 as uuidv4 } from 'uuid';
import { DATABASE_CONNECTION } from '../database/database.constants';
import { LogsService } from '../logs/logs.service';
import { BatchesService } from '../batches/batches.service';
import { StockService } from '../stock/stock.service';
import {
    CreatePurchaseOrderDto,
    UpdatePurchaseOrderDto,
    SendPurchaseOrderEmailDto,
    ChangePurchaseOrderStatusDto,
} from './dto/create-purchase-order.dto';
import { ReceiveStockDto } from './dto/receive-stock.dto';
import {
    PurchaseOrder,
    PurchaseOrderStatus,
    PurchaseOrderItem,
    ReceivingRecord,
    ReceivingItem,
} from './purchases.types';

@Injectable()
export class PurchasesService {
    constructor(
        @Inject(DATABASE_CONNECTION) private db: DocumentScope<any>,
        private readonly logsService: LogsService,
        private readonly batchesService: BatchesService,
        private readonly stockService: StockService,
        @Inject('MailService') private readonly mailService: any,
    ) { }

    private readonly logger = {
        log: (message: string, ...args: any[]) => console.log(message, ...args),
        error: (message: string, ...args: any[]) =>
            console.error(message, ...args),
        warn: (message: string, ...args: any[]) => console.warn(message, ...args),
    };

    /**
     * Generate PO number in format: PO-YYYYMMDD-XXX
     */
    async generatePONumber(tenantId: string): Promise<string> {
        const today = new Date();
        const dateStr = today.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD

        const prefix = `PO-${dateStr}`;

        try {
            // Find all POs created today
            const result = await this.db.partitionedFind(tenantId, {
                selector: {
                    type: 'purchase',
                    poNumber: {
                        $regex: `^${prefix}`,
                    },
                },
                sort: [{ poNumber: 'desc' }],
                limit: 1,
            });

            if (result.docs.length > 0) {
                const lastPO = result.docs[0];
                const lastNumber = parseInt(lastPO.poNumber.split('-')[2], 10);
                const nextNumber = lastNumber + 1;
                return `${prefix}-${nextNumber.toString().padStart(3, '0')}`;
            }

            return `${prefix}-001`;
        } catch (error) {
            this.logger.error('Error generating PO number', error);
            throw new InternalServerErrorException({
                key: 'purchase.generate_number_failed',
            });
        }
    }

    /**
     * Validate supplier exists and is active
     */
    async validateSupplier(tenantId: string, supplierId: string) {
        try {
            const fullSupplierId = supplierId.startsWith(tenantId)
                ? supplierId
                : `${tenantId}:supplier:${supplierId}`;

            const supplier = await this.db.get(fullSupplierId);

            if (!supplier || supplier.type !== 'supplier') {
                throw new NotFoundException({
                    key: 'supplier.not_found',
                    vars: { supplierId },
                });
            }

            if (supplier.status !== 'active') {
                throw new BadRequestException({
                    key: 'purchase.supplier_not_active',
                    vars: { supplierName: supplier.name },
                });
            }

            return supplier;
        } catch (error) {
            if (error.statusCode === 404) {
                throw new NotFoundException({
                    key: 'supplier.not_found',
                    vars: { supplierId },
                });
            }
            throw error;
        }
    }

    /**
     * Validate product exists
     */
    async validateProduct(tenantId: string, productId: string) {
        try {
            const fullProductId = productId.startsWith(tenantId)
                ? productId
                : `${tenantId}:product:${productId}`;

            const product = await this.db.get(fullProductId);

            if (!product || product.type !== 'product') {
                throw new NotFoundException({
                    key: 'product.not_found',
                    vars: { productId },
                });
            }

            return product;
        } catch (error) {
            if (error.statusCode === 404) {
                throw new NotFoundException({
                    key: 'product.not_found',
                    vars: { productId },
                });
            }
            throw error;
        }
    }

    /**
     * Validate expected delivery date is in the future
     */
    validateExpectedDeliveryDate(expectedDeliveryDate?: string) {
        if (expectedDeliveryDate) {
            const deliveryDate = new Date(expectedDeliveryDate);
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            if (deliveryDate < today) {
                throw new BadRequestException({
                    key: 'purchase.expected_delivery_date_past',
                });
            }
        }
    }

    /**
     * Create a new purchase order
     */
    async create(
        tenantId: string,
        userId: string,
        userName: string,
        createDto: CreatePurchaseOrderDto,
    ): Promise<PurchaseOrder> {
        try {
            // 1. Validate supplier exists and is active
            const supplier = await this.validateSupplier(
                tenantId,
                createDto.supplierId,
            );

            // 2. Validate all products exist
            const validatedItems: PurchaseOrderItem[] = [];
            for (const item of createDto.items) {
                const product = await this.validateProduct(tenantId, item.productId);

                // Validate quantities and prices
                if (item.quantityOrdered <= 0) {
                    throw new BadRequestException({
                        key: 'purchase.invalid_quantity',
                        vars: { sku: product.sku },
                    });
                }

                if (item.unitCost < 0) {
                    throw new BadRequestException({
                        key: 'purchase.invalid_price',
                        vars: { sku: product.sku },
                    });
                }

                const lineTotal = item.quantityOrdered * item.unitCost;

                validatedItems.push({
                    productId: product._id,
                    sku: product.sku,
                    productName: product.name,
                    quantityOrdered: item.quantityOrdered,
                    quantityReceived: 0,
                    unitCost: item.unitCost,
                    lineTotal,
                    notes: item.notes,
                });
            }

            // 3. Validate expected delivery date
            this.validateExpectedDeliveryDate(createDto.expectedDeliveryDate);

            // 4. Calculate totals
            const subtotal = validatedItems.reduce(
                (sum, item) => sum + item.lineTotal,
                0,
            );
            const taxAmount = createDto.taxAmount || 0;
            const shippingCost = createDto.shippingCost || 0;
            const discountAmount = createDto.discountAmount || 0;
            const totalAmount = subtotal + taxAmount + shippingCost - discountAmount;

            // 5. Generate PO number
            const poNumber = await this.generatePONumber(tenantId);

            // 6. Create PO document
            const now = new Date().toISOString();
            const newPO: PurchaseOrder = {
                _id: `${tenantId}:purchase:${uuidv4()}`,
                type: 'purchase',
                tenantId,
                poNumber,
                status: PurchaseOrderStatus.DRAFT,
                supplierId: supplier._id,
                supplierName: supplier.name,
                supplierEmail: supplier.email,
                currency: createDto.currency,
                subtotal,
                taxAmount,
                shippingCost,
                discountAmount,
                totalAmount,
                items: validatedItems,
                orderDate: now,
                expectedDeliveryDate: createDto.expectedDeliveryDate,
                receivingIds: [],
                pdfMetadata: createDto.pdfMetadata,
                emailHistory: [],
                createdAt: now,
                createdBy: { userId, name: userName },
                updatedAt: now,
                updatedBy: { userId, name: userName },
            };

            // 7. Save to database
            const response = await this.db.insert(newPO);
            const result = { ...newPO, _rev: response.rev };

            // 8. Log creation
            try {
                await this.logsService.record(
                    tenantId,
                    { userId, name: userName },
                    'purchase.create',
                    'purchase',
                    result._id,
                    {
                        poNumber,
                        supplierName: supplier.name,
                        totalAmount,
                        itemCount: validatedItems.length,
                    },
                );
            } catch (logError) {
                this.logger.warn('Failed to record purchase creation log', logError);
            }

            return result;
        } catch (error) {
            if (
                error instanceof NotFoundException ||
                error instanceof BadRequestException ||
                error instanceof ConflictException
            ) {
                throw error;
            }

            this.logger.error('Failed to create purchase order', error);
            throw new InternalServerErrorException({
                key: 'purchase.create_failed',
            });
        }
    }

    /**
     * Find PO by ID
     */
    async findOne(tenantId: string, purchaseId: string): Promise<PurchaseOrder> {
        try {
            const fullId = purchaseId.startsWith(tenantId)
                ? purchaseId
                : `${tenantId}:purchase:${purchaseId}`;

            const po = await this.db.get(fullId);

            if (!po || po.type !== 'purchase') {
                throw new NotFoundException({
                    key: 'purchase.not_found',
                    vars: { purchaseId },
                });
            }

            return po;
        } catch (error) {
            if (error.statusCode === 404 || error instanceof NotFoundException) {
                throw new NotFoundException({
                    key: 'purchase.not_found',
                    vars: { purchaseId },
                });
            }

            this.logger.error('Failed to find purchase order', error);
            throw new InternalServerErrorException({
                key: 'purchase.query_failed',
            });
        }
    }

    /**
     * List all purchase orders with optional filters
     */
    async findAll(
        tenantId: string,
        status?: PurchaseOrderStatus,
        supplierId?: string,
        limit = 50,
        skip = 0,
    ): Promise<PurchaseOrder[]> {
        try {
            const selector: any = {
                type: 'purchase',
            };

            if (status) {
                selector.status = status;
            }

            if (supplierId) {
                const fullSupplierId = supplierId.startsWith(tenantId)
                    ? supplierId
                    : `${tenantId}:supplier:${supplierId}`;
                selector.supplierId = fullSupplierId;
            }

            const result = await this.db.partitionedFind(tenantId, {
                selector,
                sort: [{ orderDate: 'desc' }],
                limit,
                skip,
            });

            return result.docs;
        } catch (error) {
            this.logger.error('Failed to list purchase orders', error);
            throw new InternalServerErrorException({
                key: 'purchase.list_failed',
            });
        }
    }

    /**
     * Update a draft purchase order
     */
    async update(
        tenantId: string,
        userId: string,
        userName: string,
        purchaseId: string,
        updateDto: UpdatePurchaseOrderDto,
    ): Promise<PurchaseOrder> {
        try {
            const po = await this.findOne(tenantId, purchaseId);

            // Can only update draft POs
            if (po.status !== PurchaseOrderStatus.DRAFT) {
                throw new BadRequestException({
                    key: 'purchase.cannot_update_non_draft',
                    vars: { status: po.status },
                });
            }

            // If supplier is changing, validate new supplier
            if (updateDto.supplierId) {
                await this.validateSupplier(tenantId, updateDto.supplierId);
            }

            // If items are changing, validate products and recalculate
            let validatedItems: PurchaseOrderItem[] | undefined;
            if (updateDto.items) {
                validatedItems = [];
                for (const item of updateDto.items) {
                    const product = await this.validateProduct(tenantId, item.productId);

                    if (item.quantityOrdered <= 0 || item.unitCost < 0) {
                        throw new BadRequestException({
                            key: 'purchase.invalid_item_data',
                            vars: { sku: product.sku },
                        });
                    }

                    validatedItems.push({
                        productId: product._id,
                        sku: product.sku,
                        productName: product.name,
                        quantityOrdered: item.quantityOrdered,
                        quantityReceived: 0,
                        unitCost: item.unitCost,
                        lineTotal: item.quantityOrdered * item.unitCost,
                        notes: item.notes,
                    });
                }
            }

            // Validate expected delivery date if changing
            if (updateDto.expectedDeliveryDate) {
                this.validateExpectedDeliveryDate(updateDto.expectedDeliveryDate);
            }

            // Recalculate totals
            const items = validatedItems || po.items;
            const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
            const taxAmount = updateDto.taxAmount ?? po.taxAmount;
            const shippingCost = updateDto.shippingCost ?? po.shippingCost;
            const discountAmount = updateDto.discountAmount ?? po.discountAmount;
            const totalAmount = subtotal + taxAmount + shippingCost - discountAmount;

            // Update PO
            const updatedPO: PurchaseOrder = {
                ...po,
                currency: updateDto.currency ?? po.currency,
                items,
                subtotal,
                taxAmount,
                shippingCost,
                discountAmount,
                totalAmount,
                expectedDeliveryDate:
                    updateDto.expectedDeliveryDate ?? po.expectedDeliveryDate,
                pdfMetadata: updateDto.pdfMetadata ?? po.pdfMetadata,
                updatedAt: new Date().toISOString(),
                updatedBy: { userId, name: userName },
            };

            const response = await this.db.insert(updatedPO);
            const result = { ...updatedPO, _rev: response.rev };

            // Log update
            try {
                await this.logsService.record(
                    tenantId,
                    { userId, name: userName },
                    'purchase.update',
                    'purchase',
                    result._id,
                    { poNumber: po.poNumber },
                );
            } catch (logError) {
                this.logger.warn('Failed to record purchase update log', logError);
            }

            return result;
        } catch (error) {
            if (
                error instanceof NotFoundException ||
                error instanceof BadRequestException
            ) {
                throw error;
            }

            this.logger.error('Failed to update purchase order', error);
            throw new InternalServerErrorException({
                key: 'purchase.update_failed',
            });
        }
    }

    /**
     * Change PO status
     */
    async changeStatus(
        tenantId: string,
        userId: string,
        userName: string,
        purchaseId: string,
        statusDto: ChangePurchaseOrderStatusDto,
    ): Promise<PurchaseOrder> {
        try {
            const po = await this.findOne(tenantId, purchaseId);

            // Validate status transitions
            const validTransitions: Record<PurchaseOrderStatus, PurchaseOrderStatus[]> = {
                [PurchaseOrderStatus.DRAFT]: [PurchaseOrderStatus.PENDING, PurchaseOrderStatus.CANCELLED],
                [PurchaseOrderStatus.PENDING]: [PurchaseOrderStatus.PARTIAL, PurchaseOrderStatus.COMPLETED, PurchaseOrderStatus.CANCELLED],
                [PurchaseOrderStatus.PARTIAL]: [PurchaseOrderStatus.COMPLETED, PurchaseOrderStatus.CANCELLED],
                [PurchaseOrderStatus.COMPLETED]: [],
                [PurchaseOrderStatus.CANCELLED]: [],
                [PurchaseOrderStatus.OVERDELIVERED]: [],
            };

            if (!validTransitions[po.status].includes(statusDto.status)) {
                throw new BadRequestException({
                    key: 'purchase.invalid_status_transition',
                    vars: { from: po.status, to: statusDto.status },
                });
            }

            const updatedPO: PurchaseOrder = {
                ...po,
                status: statusDto.status,
                updatedAt: new Date().toISOString(),
                updatedBy: { userId, name: userName },
            };

            const response = await this.db.insert(updatedPO);
            const result = { ...updatedPO, _rev: response.rev };

            // Log status change
            try {
                await this.logsService.record(
                    tenantId,
                    { userId, name: userName },
                    'purchase.status_change',
                    'purchase',
                    result._id,
                    {
                        poNumber: po.poNumber,
                        from: po.status,
                        to: statusDto.status,
                        reason: statusDto.reason,
                    },
                );
            } catch (logError) {
                this.logger.warn('Failed to record purchase status change log', logError);
            }

            return result;
        } catch (error) {
            if (
                error instanceof NotFoundException ||
                error instanceof BadRequestException
            ) {
                throw error;
            }

            this.logger.error('Failed to change purchase order status', error);
            throw new InternalServerErrorException({
                key: 'purchase.status_change_failed',
            });
        }
    }

    /**
     * Find PO by number
     */
    async findByNumber(
        tenantId: string,
        poNumber: string,
    ): Promise<PurchaseOrder> {
        try {
            const result = await this.db.partitionedFind(tenantId, {
                selector: {
                    type: 'purchase',
                    poNumber,
                },
                limit: 1,
            });

            if (result.docs.length === 0) {
                throw new NotFoundException({
                    key: 'purchase.not_found_by_number',
                    vars: { poNumber },
                });
            }

            return result.docs[0];
        } catch (error) {
            if (error instanceof NotFoundException) {
                throw error;
            }

            this.logger.error('Failed to find purchase order by number', error);
            throw new InternalServerErrorException({
                key: 'purchase.query_failed',
            });
        }
    }

    /**
     * Generate receiving number in format: RCV-YYYYMMDD-XXX
     */
    async generateReceivingNumber(tenantId: string): Promise<string> {
        const today = new Date();
        const dateStr = today.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD

        const prefix = `RCV-${dateStr}`;

        try {
            const result = await this.db.partitionedFind(tenantId, {
                selector: {
                    type: 'receiving',
                    receivingNumber: {
                        $regex: `^${prefix}`,
                    },
                },
                sort: [{ receivingNumber: 'desc' }],
                limit: 1,
            });

            if (result.docs.length === 0) {
                return `${prefix}-001`;
            }

            const lastNumber = result.docs[0].receivingNumber;
            const sequence = parseInt(lastNumber.split('-')[2], 10);
            const nextSequence = (sequence + 1).toString().padStart(3, '0');

            return `${prefix}-${nextSequence}`;
        } catch (error) {
            this.logger.error('Failed to generate receiving number', error);
            return `${prefix}-001`;
        }
    }

    /**
     * Receive stock against a purchase order
     * Creates batches and updates stock levels
     */
    async receiveStock(
        tenantId: string,
        userId: string,
        userName: string,
        poId: string,
        dto: ReceiveStockDto,
    ): Promise<ReceivingRecord> {
        try {
            // 1. Get the purchase order
            const po = await this.findOne(tenantId, poId);

            // 2. Validate PO status (must be pending or partial)
            if (
                po.status !== PurchaseOrderStatus.PENDING &&
                po.status !== PurchaseOrderStatus.PARTIAL
            ) {
                throw new BadRequestException({
                    key: 'purchase.cannot_receive_status',
                    vars: { status: po.status },
                });
            }

            const now = new Date().toISOString();
            const receivingItems: ReceivingItem[] = [];
            const createdBatches: any[] = [];
            let totalQuantityReceived = 0;
            let totalCost = 0;

            // 3. Process each receiving item
            for (const item of dto.items) {
                // Find matching PO item
                const poItem = po.items.find((i) => i.productId === item.productId);
                if (!poItem) {
                    throw new BadRequestException({
                        key: 'purchase.product_not_in_po',
                        vars: { productId: item.productId },
                    });
                }

                // Check for over-delivery
                const remainingQuantity =
                    poItem.quantityOrdered - poItem.quantityReceived;
                if (item.quantityReceiving > remainingQuantity) {
                    throw new BadRequestException({
                        key: 'purchase.overdelivery_not_allowed',
                        vars: {
                            productId: item.productId,
                            sku: poItem.sku,
                            quantityReceiving: item.quantityReceiving,
                            remainingQuantity,
                        },
                    });
                }

                // Use cost from DTO if provided, otherwise use PO cost
                const unitCost = item.unitCost ?? poItem.unitCost;

                let batchId: string | undefined;

                // If batch number provided, create batch. Otherwise, adjust stock directly
                if (item.batchNumber) {
                    // Create batch for this receipt
                    try {
                        const batch = await this.batchesService.create(
                            tenantId,
                            userId,
                            userName,
                            {
                                productId: item.productId,
                                batchNumber: item.batchNumber,
                                quantity: item.quantityReceiving,
                                purchaseCost: unitCost,
                                supplierId: po.supplierId,
                                purchaseId: po._id,
                                location: 'default',
                            },
                        );

                        createdBatches.push(batch);
                        batchId = batch._id;
                    } catch (batchError) {
                        this.logger.error('Failed to create batch', batchError);
                        throw new InternalServerErrorException({
                            key: 'purchase.batch_creation_failed',
                            vars: { batchNumber: item.batchNumber },
                        });
                    }
                } else {
                    // No batch tracking - adjust stock directly
                    try {
                        await this.stockService.adjustStock(
                            tenantId,
                            userId,
                            userName,
                            {
                                productId: item.productId,
                                quantity: item.quantityReceiving,
                                type: 'in',
                                purchaseCost: unitCost,
                                reason: `Purchase order ${po.poNumber} received`,
                                referenceId: po._id.split(':').pop()!,
                                referenceType: 'purchase_order' as any,
                                location: 'default',
                            },
                        );
                    } catch (stockError) {
                        this.logger.error('Failed to adjust stock', stockError);
                        throw new InternalServerErrorException({
                            key: 'purchase.stock_adjustment_failed',
                        });
                    }
                }

                // Update PO item received quantity
                poItem.quantityReceived += item.quantityReceiving;

                // Add to receiving record
                receivingItems.push({
                    productId: item.productId,
                    sku: poItem.sku,
                    productName: poItem.productName,
                    quantityOrdered: poItem.quantityOrdered,
                    quantityPreviouslyReceived:
                        poItem.quantityReceived - item.quantityReceiving,
                    quantityReceiving: item.quantityReceiving,
                    unitCost,
                    batchNumber: item.batchNumber,
                    batchId,
                    notes: item.notes,
                });

                totalQuantityReceived += item.quantityReceiving;
                totalCost += unitCost * item.quantityReceiving;
            }

            // 4. Create receiving record
            const receivingNumber = await this.generateReceivingNumber(tenantId);
            const receiving: ReceivingRecord = {
                _id: `${tenantId}:receiving:${uuidv4()}`,
                type: 'receiving',
                tenantId,
                purchaseOrderId: po._id,
                poNumber: po.poNumber,
                receivingNumber,
                supplierId: po.supplierId,
                supplierName: po.supplierName,
                items: receivingItems,
                totalQuantityReceived,
                currency: po.currency,
                totalCost,
                status: 'completed',
                receivedDate: dto.receivedDate,
                notes: dto.notes,
                discrepancyNotes: dto.discrepancyNotes,
                createdAt: now,
                createdBy: { userId, name: userName },
                updatedAt: now,
                updatedBy: { userId, name: userName },
            };

            const rcvResponse = await this.db.insert(receiving);
            const result = { ...receiving, _rev: rcvResponse.rev };

            // 5. Update PO status based on received quantities
            const allFullyReceived = po.items.every(
                (item) => item.quantityReceived >= item.quantityOrdered,
            );
            const anyReceived = po.items.some((item) => item.quantityReceived > 0);

            if (allFullyReceived) {
                po.status = PurchaseOrderStatus.COMPLETED;
                po.actualDeliveryDate = dto.receivedDate;
            } else if (anyReceived) {
                po.status = PurchaseOrderStatus.PARTIAL;
            }

            // Add receiving reference
            if (!po.receivingIds) {
                po.receivingIds = [];
            }
            po.receivingIds.push(result._id);

            po.updatedAt = now;
            po.updatedBy = { userId, name: userName };

            // Update PO
            await this.db.insert(po);

            // 6. Log the receiving
            try {
                await this.logsService.record(
                    tenantId,
                    { userId, name: userName },
                    'purchase.receive_stock',
                    'receiving',
                    result._id,
                    {
                        poNumber: po.poNumber,
                        receivingNumber,
                        totalQuantityReceived,
                        totalCost,
                        itemCount: receivingItems.length,
                        newStatus: po.status,
                    },
                );
            } catch (logError) {
                this.logger.warn('Failed to log stock receiving', logError);
            }

            return result;
        } catch (error) {
            if (
                error instanceof NotFoundException ||
                error instanceof BadRequestException ||
                error instanceof InternalServerErrorException
            ) {
                throw error;
            }

            this.logger.error('Failed to receive stock', error);
            throw new InternalServerErrorException({
                key: 'purchase.receive_failed',
            });
        }
    }

    /**
     * Send purchase order to supplier via email
     * Changes status from draft to pending
     */
    async sendEmail(
        tenantId: string,
        userId: string,
        userName: string,
        poId: string,
        dto: SendPurchaseOrderEmailDto,
    ): Promise<PurchaseOrder> {
        try {
            // Get the purchase order
            const po = await this.findOne(tenantId, poId);

            // Validate: Can only send draft or pending POs
            if (
                po.status !== PurchaseOrderStatus.DRAFT &&
                po.status !== PurchaseOrderStatus.PENDING
            ) {
                throw new BadRequestException({
                    key: 'purchase.cannot_send_non_draft',
                    vars: { status: po.status },
                });
            }

            // Get supplier info
            const supplier = await this.db.get(po.supplierId);

            // Prepare email content
            const subject = `Purchase Order ${po.poNumber} from ${po.companyInfo?.name || 'Company'}`;

            const emailTo = dto.recipientEmail || supplier.email;
            if (!emailTo) {
                throw new BadRequestException({
                    key: 'purchase.no_supplier_email',
                });
            }

            // Build email body using template
            const locale = dto.locale || 'en';
            const { html, text } = this.buildPurchaseOrderEmailBody(
                po,
                supplier,
                dto.message,
                locale,
            );

            // Parse CC emails
            const ccEmails = dto.ccEmails
                ? dto.ccEmails.split(',').map((e) => e.trim()).filter(Boolean)
                : [];

            // Send email
            const emailResult = await this.mailService.sendEmail({
                to: [emailTo, ...ccEmails],
                subject,
                html,
                text,
            });

            if (!emailResult.success) {
                throw new InternalServerErrorException({
                    key: 'purchase.email_send_failed',
                    vars: { error: emailResult.error || 'Unknown error' },
                });
            }

            // Update PO status to pending if it was draft
            const now = new Date().toISOString();
            if (po.status === PurchaseOrderStatus.DRAFT) {
                po.status = PurchaseOrderStatus.PENDING;
                po.updatedAt = now;
                po.updatedBy = { userId, name: userName };
            }

            // Add email history
            if (!po.emailHistory) {
                po.emailHistory = [];
            }

            po.emailHistory.push({
                sentAt: now,
                sentBy: { userId, name: userName },
                recipientEmail: emailTo,
                ccEmails: ccEmails.length > 0 ? ccEmails : undefined,
                status: 'sent',
            });

            // Update in database
            const response = await this.db.insert(po);

            // Log the action
            try {
                await this.logsService.record(
                    tenantId,
                    { userId, name: userName },
                    'purchase.email_sent',
                    'purchase',
                    po._id,
                    {
                        poNumber: po.poNumber,
                        recipientEmail: emailTo,
                        status: po.status,
                    },
                );
            } catch (logError) {
                this.logger.warn('Failed to log email sending', logError);
            }

            return { ...po, _rev: response.rev };
        } catch (error) {
            if (
                error instanceof NotFoundException ||
                error instanceof BadRequestException
            ) {
                throw error;
            }

            this.logger.error('Failed to send purchase order email', error);
            throw new InternalServerErrorException({
                key: 'purchase.email_send_failed',
                vars: { error: (error as any).message || 'Unknown error' },
            });
        }
    }

    /**
     * Build HTML email body for purchase order using template
     */
    private buildPurchaseOrderEmailBody(
        po: PurchaseOrder,
        supplier: any,
        customMessage?: string,
        locale = 'en',
    ): { html: string; text: string } {
        // Generate item rows HTML
        const itemsRows = po.items
            .map(
                (item) => `
            <tr>
                <td style="padding: 8px; border: 1px solid #ddd;">${item.sku}</td>
                <td style="padding: 8px; border: 1px solid #ddd;">${item.productName}</td>
                <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${item.quantityOrdered}</td>
                <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${item.unitCost.toFixed(2)}</td>
                <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${item.lineTotal.toFixed(2)}</td>
            </tr>
        `,
            )
            .join('');

        // Prepare template variables
        const templateVars = {
            poNumber: po.poNumber,
            customMessage: customMessage || '',
            companyName: po.companyInfo?.name || 'N/A',
            companyAddress: po.companyInfo?.address || '',
            companyPhone: po.companyInfo?.phone || 'N/A',
            companyEmail: po.companyInfo?.email || 'N/A',
            supplierName: supplier.name,
            supplierAddress: supplier.address || '',
            supplierPhone: supplier.phone || 'N/A',
            supplierEmail: supplier.email || 'N/A',
            orderDate: new Date(po.orderDate).toLocaleDateString(),
            expectedDeliveryDate: po.expectedDeliveryDate
                ? new Date(po.expectedDeliveryDate).toLocaleDateString()
                : '',
            status: po.status,
            itemsRows,
            subtotal: po.subtotal.toFixed(2),
            taxAmount: po.taxAmount > 0 ? po.taxAmount.toFixed(2) : '',
            shippingCost: po.shippingCost > 0 ? po.shippingCost.toFixed(2) : '',
            discountAmount: po.discountAmount > 0 ? po.discountAmount.toFixed(2) : '',
            totalAmount: po.totalAmount.toFixed(2),
            notes: po.notes || '',
        };

        return this.mailService.renderPurchaseOrderTemplate(locale, templateVars);
    }
}
