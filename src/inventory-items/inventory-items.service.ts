import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import nano, { type DocumentScope } from 'nano';
import { v4 as uuidv4 } from 'uuid';
import { DATABASE_CONNECTION } from '../database/database.constants';
import { LogsService } from '../logs/logs.service';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';

@Injectable()
export class InventoryItemsService {
  constructor(
    @Inject(DATABASE_CONNECTION) private db: DocumentScope<any>,
    @Inject(LogsService) private readonly logsService: LogsService,
  ) {}

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
}
