import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import nano, { type DocumentScope } from 'nano';
import { v4 as uuidv4 } from 'uuid';
import { DATABASE_CONNECTION } from '../database/database.constants';
import { LogsService } from '../logs/logs.service';
import { BatchesService } from '../batches/batches.service';
import { StockService } from '../stock/stock.service';
import { StockReferenceType } from '../stock/stock-reference-type.enum';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';
import { CreateOpeningStockDto } from './dto/opening-stock.dto';
import {
  OpeningStockEntry,
  OpeningStockItem,
  OpeningStockItemType,
} from './inventory-items.types';

@Injectable()
export class InventoryItemsService {
  constructor(
    @Inject(DATABASE_CONNECTION) private db: DocumentScope<any>,
    @Inject(LogsService) private readonly logsService: LogsService,
    private readonly batchesService: BatchesService,
    private readonly stockService: StockService,
  ) { }

  private readonly logger = {
    log: (message: string, ...args: any[]) => console.log(message, ...args),
    error: (message: string, ...args: any[]) =>
      console.error(message, ...args),
    warn: (message: string, ...args: any[]) => console.warn(message, ...args),
  };

  async create(
    tenantId: string,
    userId: string,
    userName: string,
    createInventoryItemDto: CreateInventoryItemDto,
  ) {
    try {
      const { productId, serialNumber, batchId, ...rest } =
        createInventoryItemDto;

      // Verify product exists
      const productDocId = `${tenantId}:product:${productId}`;
      try {
        await this.db.get(productDocId);
      } catch (error) {
        if (error.statusCode === 404) {
          throw new NotFoundException('product.not_found');
        }
        throw error;
      }

      // Verify serial number is unique
      const existingQuery = {
        selector: {
          type: 'inventory-item',
          serialNumber: serialNumber,
        },
        limit: 1,
      };
      const existingResult = await this.db.partitionedFind(
        tenantId,
        existingQuery,
      );
      if (existingResult.docs.length > 0) {
        throw new ConflictException('inventory_item.serial_exists');
      }

      // If batchId provided, verify batch exists and get batch info
      let batch: any = null;
      if (batchId) {
        const batchDocId = `${tenantId}:batch:${batchId}`;
        try {
          batch = await this.db.get(batchDocId);
        } catch (error) {
          if (error.statusCode === 404) {
            throw new NotFoundException('batch.not_found');
          }
          throw error;
        }
      }

      const now = new Date().toISOString();
      const itemId = uuidv4();
      const inventoryItem = {
        _id: `${tenantId}:inventory-item:${itemId}`,
        type: 'inventory-item',
        tenantId,
        itemId,
        productId,
        serialNumber,
        batchId: batchId || null,
        status: rest.status || 'in_stock',
        condition: rest.condition || 'new',
        location: rest.location || null,
        purchaseId: rest.purchaseId || null,
        supplierId: rest.supplierId || null,
        saleId: null,
        warrantyExpiryDate: rest.warrantyExpiryDate || null,
        warrantyId: rest.warrantyId || null,
        notes: rest.notes || null,
        createdAt: now,
        updatedAt: now,
        createdBy: { userId, userName },
        updatedBy: { userId, userName },
      };

      const result = await this.db.insert(inventoryItem);
      inventoryItem['_rev'] = result.rev;

      await this.logsService.record(
        tenantId,
        { userId, name: userName },
        'inventory-item.create',
        'inventory-item',
        itemId,
        { serialNumber, productId, status: inventoryItem.status },
      );

      // Calculate remaining untracked items if batch exists
      let remainingUntracked: number | null = null;
      if (batch) {
        // Count how many inventory items already exist for this batch
        const countQuery: any = {
          selector: {
            type: 'inventory-item',
            batchId: batchId!,
          },
          fields: ['_id'],
        };
        const itemsResult = await this.db.partitionedFind(tenantId, countQuery);
        const serializedCount = itemsResult.docs.length;
        remainingUntracked = batch.quantityAvailable - serializedCount;
      }

      return {
        inventoryItem,
        batch: batch
          ? {
            batchId: batch.batchId,
            batchNumber: batch.batchNumber,
            quantityReceived: batch.quantityReceived,
            quantityAvailable: batch.quantityAvailable,
          }
          : null,
        remainingUntracked,
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ConflictException
      ) {
        throw error;
      }
      throw new InternalServerErrorException('inventory_item.create_failed');
    }
  }

  async findBySerial(tenantId: string, serialNumber: string) {
    try {
      const query = {
        selector: {
          type: 'inventory-item',
          serialNumber: serialNumber,
        },
        limit: 1,
      };

      const result = await this.db.partitionedFind(tenantId, query);

      if (result.docs.length === 0) {
        throw new NotFoundException('inventory_item.not_found_by_serial');
      }

      return result.docs[0];
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('inventory_item.search_failed');
    }
  }

  async findAvailableByProduct(tenantId: string, productId: string) {
    try {
      const query = {
        selector: {
          type: 'inventory-item',
          productId: productId,
          status: 'in_stock',
        },
      };

      const result = await this.db.partitionedFind(tenantId, query);
      return result.docs;
    } catch (error) {
      throw new InternalServerErrorException('inventory_item.query_failed');
    }
  }

  async findAll(
    tenantId: string,
    filters?: { productId?: string; status?: string; batchId?: string },
  ) {
    try {
      const selector: any = {
        type: 'inventory-item',
      };

      if (filters?.productId) {
        selector.productId = filters.productId;
      }
      if (filters?.status) {
        selector.status = filters.status;
      }
      if (filters?.batchId) {
        selector.batchId = filters.batchId;
      }

      const query = { selector };
      const result = await this.db.partitionedFind(tenantId, query);
      return result.docs;
    } catch (error) {
      throw new InternalServerErrorException('inventory_item.list_failed');
    }
  }

  async findOne(tenantId: string, itemId: string) {
    try {
      const docId = `${tenantId}:inventory-item:${itemId}`;
      const item = await this.db.get(docId);
      return item;
    } catch (error) {
      if (error.statusCode === 404) {
        throw new NotFoundException('inventory_item.not_found');
      }
      throw new InternalServerErrorException('inventory_item.query_failed');
    }
  }

  async update(
    tenantId: string,
    userId: string,
    userName: string,
    itemId: string,
    updateInventoryItemDto: UpdateInventoryItemDto,
  ) {
    try {
      const docId = `${tenantId}:inventory-item:${itemId}`;
      const existingItem = await this.db.get(docId);

      const updatedItem = {
        ...existingItem,
        ...updateInventoryItemDto,
        updatedAt: new Date().toISOString(),
        updatedBy: { userId, userName },
      };

      const result = await this.db.insert(updatedItem);
      updatedItem['_rev'] = result.rev;

      await this.logsService.record(
        tenantId,
        { userId, name: userName },
        'inventory-item.update',
        'inventory-item',
        itemId,
        {
          changes: updateInventoryItemDto,
          serialNumber: existingItem.serialNumber,
        },
      );
      return updatedItem;
    } catch (error) {
      if (error.statusCode === 404) {
        throw new NotFoundException('inventory_item.not_found');
      }
      throw new InternalServerErrorException('inventory_item.update_failed');
    }
  }

  /**
   * Generate opening stock entry number: OS-YYYYMMDD-XXX
   */
  async generateOpeningStockNumber(tenantId: string): Promise<string> {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `OS-${dateStr}`;

    try {
      const result = await this.db.partitionedFind(tenantId, {
        selector: {
          type: 'opening_stock',
          entryNumber: {
            $regex: `^${prefix}`,
          },
        },
        sort: [{ entryNumber: 'desc' }],
        limit: 1,
      });

      if (result.docs.length === 0) {
        return `${prefix}-001`;
      }

      const lastNumber = result.docs[0].entryNumber;
      const sequence = parseInt(lastNumber.split('-')[2], 10);
      const nextSequence = (sequence + 1).toString().padStart(3, '0');

      return `${prefix}-${nextSequence}`;
    } catch (error) {
      this.logger.error('Failed to generate opening stock number', error);
      return `${prefix}-001`;
    }
  }

  /**
   * Create opening stock entry
   * Handles regular, batched, and serialized items
   */
  async createOpeningStock(
    tenantId: string,
    userId: string,
    userName: string,
    dto: CreateOpeningStockDto,
  ): Promise<OpeningStockEntry> {
    try {
      const now = new Date().toISOString();
      const entryNumber = await this.generateOpeningStockNumber(tenantId);
      const openingStockItems: OpeningStockItem[] = [];
      const batchIds: string[] = [];
      const serialIds: string[] = [];
      let totalQuantity = 0;
      let totalCost = 0;

      // Process each item
      for (const item of dto.items) {
        // Get product details
        const productId = item.productId.includes(':')
          ? item.productId
          : `${tenantId}:product:${item.productId}`;

        let product: any;
        try {
          product = await this.db.get(productId);
        } catch (err) {
          if ((err as any).statusCode === 404) {
            throw new NotFoundException({
              key: 'product.not_found',
              vars: { productId: item.productId },
            });
          }
          throw err;
        }

        const location = item.location || 'default';
        const itemTotalCost = item.unitCost * item.quantity;

        // Determine item type based on what's provided
        let itemType: OpeningStockItemType;
        if (item.serialNumbers && item.serialNumbers.length > 0) {
          itemType = OpeningStockItemType.SERIALIZED;

          // Validate serial numbers match quantity
          if (item.serialNumbers.length !== item.quantity) {
            throw new BadRequestException({
              key: 'opening_stock.serial_quantity_mismatch',
              vars: {
                sku: product.sku,
                expected: item.quantity,
                provided: item.serialNumbers.length,
              },
            });
          }

          // Create inventory items for each serial number
          for (const serialNumber of item.serialNumbers) {
            try {
              const result = await this.create(
                tenantId,
                userId,
                userName,
                {
                  productId: item.productId,
                  serialNumber,
                  status: 'in_stock',
                  condition: 'new',
                  location,
                  notes: item.notes,
                },
              );
              serialIds.push(result.inventoryItem._id);
            } catch (error) {
              this.logger.error(
                `Failed to create serial item ${serialNumber}`,
                error,
              );
              throw new InternalServerErrorException({
                key: 'opening_stock.serial_creation_failed',
                vars: { serialNumber },
              });
            }
          }

          // Adjust stock for serialized items
          await this.stockService.adjustStock(tenantId, userId, userName, {
            productId,
            quantity: item.quantity,
            type: 'in',
            purchaseCost: item.unitCost,
            reason: `Opening stock entry ${entryNumber}`,
            referenceId: entryNumber,
            referenceType: StockReferenceType.OPENING_STOCK,
            location,
          });
        } else if (item.batchNumber) {
          itemType = OpeningStockItemType.BATCHED;

          // Create batch
          try {
            const batch = await this.batchesService.create(
              tenantId,
              userId,
              userName,
              {
                productId,
                batchNumber: item.batchNumber,
                quantity: item.quantity,
                purchaseCost: item.unitCost,
                expiryDate: item.expiryDate,
                manufactureDate: item.manufactureDate,
                location,
              },
            );
            batchIds.push(batch._id);
          } catch (error) {
            this.logger.error(
              `Failed to create batch ${item.batchNumber}`,
              error,
            );
            throw new InternalServerErrorException({
              key: 'opening_stock.batch_creation_failed',
              vars: { batchNumber: item.batchNumber },
            });
          }
        } else {
          itemType = OpeningStockItemType.REGULAR;

          // Direct stock adjustment for non-tracked items
          await this.stockService.adjustStock(tenantId, userId, userName, {
            productId,
            quantity: item.quantity,
            type: 'in',
            purchaseCost: item.unitCost,
            reason: `Opening stock entry ${entryNumber}`,
            referenceId: entryNumber,
            referenceType: StockReferenceType.OPENING_STOCK,
            location,
          });
        }

        openingStockItems.push({
          productId,
          sku: product.sku,
          productName: product.name,
          quantity: item.quantity,
          unitCost: item.unitCost,
          totalCost: itemTotalCost,
          type: itemType,
          location,
          batchNumber: item.batchNumber,
          expiryDate: item.expiryDate,
          manufactureDate: item.manufactureDate,
          serialNumbers: item.serialNumbers,
          notes: item.notes,
        });

        totalQuantity += item.quantity;
        totalCost += itemTotalCost;
      }

      // Create opening stock entry
      const openingStock: OpeningStockEntry = {
        _id: `${tenantId}:opening-stock:${uuidv4()}`,
        type: 'opening_stock',
        tenantId,
        entryNumber,
        entryDate: dto.entryDate,
        items: openingStockItems,
        totalQuantity,
        totalCost,
        batchIds,
        serialIds,
        status: 'completed',
        notes: dto.notes,
        createdAt: now,
        createdBy: { userId, name: userName },
        updatedAt: now,
        updatedBy: { userId, name: userName },
      };

      const result = await this.db.insert(openingStock);
      const finalEntry = { ...openingStock, _rev: result.rev };

      // Log the entry
      try {
        await this.logsService.record(
          tenantId,
          { userId, name: userName },
          'opening_stock.create',
          'opening_stock',
          finalEntry._id,
          {
            entryNumber,
            totalQuantity,
            totalCost,
            itemCount: openingStockItems.length,
          },
        );
      } catch (logError) {
        this.logger.warn('Failed to log opening stock creation', logError);
      }

      return finalEntry;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }

      this.logger.error('Failed to create opening stock', error);
      throw new InternalServerErrorException({
        key: 'opening_stock.create_failed',
      });
    }
  }

  /**
   * Get opening stock entry by ID
   */
  async getOpeningStock(
    tenantId: string,
    entryId: string,
  ): Promise<OpeningStockEntry> {
    try {
      const fullId = entryId.startsWith(tenantId)
        ? entryId
        : `${tenantId}:opening-stock:${entryId}`;

      const entry = await this.db.get(fullId);

      if (!entry || entry.type !== 'opening_stock') {
        throw new NotFoundException({
          key: 'opening_stock.not_found',
          vars: { entryId },
        });
      }

      return entry;
    } catch (error) {
      if (error.statusCode === 404 || error instanceof NotFoundException) {
        throw new NotFoundException({
          key: 'opening_stock.not_found',
          vars: { entryId },
        });
      }

      this.logger.error('Failed to get opening stock', error);
      throw new InternalServerErrorException({
        key: 'opening_stock.query_failed',
      });
    }
  }

  /**
   * List opening stock entries
   */
  async listOpeningStock(
    tenantId: string,
    limit = 50,
    skip = 0,
  ): Promise<OpeningStockEntry[]> {
    try {
      const result = await this.db.partitionedFind(tenantId, {
        selector: {
          type: 'opening_stock',
        },
        sort: [{ createdAt: 'desc' }],
        limit,
        skip,
      });

      return result.docs;
    } catch (error) {
      this.logger.error('Failed to list opening stock', error);
      throw new InternalServerErrorException({
        key: 'opening_stock.list_failed',
      });
    }
  }
}
