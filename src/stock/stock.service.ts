import {
  Injectable,
  Inject,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import type { DocumentScope } from 'nano';
import { DATABASE_CONNECTION } from '../database/database.constants';
import { LogsService } from '../logs/logs.service';
import { AdjustStockDto } from './dto/adjust-stock.dto';

@Injectable()
export class StockService {
  constructor(
    @Inject(DATABASE_CONNECTION) private db: DocumentScope<any>,
    @Inject(LogsService) private readonly logsService: LogsService,
  ) {}

  async getCurrentLevel(tenantId: string, productId: string) {
    try {
      const docId = `${tenantId}:stock:${productId}`;
      const stock = await this.db.get(docId);
      return stock;
    } catch (error) {
      if (error.statusCode === 404) {
        return {
          productId,
          quantityOnHand: 0,
          quantityReserved: 0,
          quantityAvailable: 0,
        };
      }
      throw new InternalServerErrorException('stock.query_failed');
    }
  }

  async adjustStock(
    tenantId: string,
    userId: string,
    userName: string,
    adjustStockDto: AdjustStockDto,
  ) {
    try {
      const {
        productId,
        quantity,
        type,
        purchaseCost,
        reason,
        referenceId,
        referenceType,
        location,
        notes,
      } = adjustStockDto;

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

      // Get or create stock document
      const stockDocId = `${tenantId}:stock:${productId}`;
      let stockDoc: any;
      try {
        stockDoc = await this.db.get(stockDocId);
      } catch (error) {
        if (error.statusCode === 404) {
          // Create new stock document
          stockDoc = {
            _id: stockDocId,
            type: 'stock',
            tenantId,
            productId,
            quantityOnHand: 0,
            quantityReserved: 0,
            quantityAvailable: 0,
            averageCost: 0,
            lastPurchaseCost: 0,
            totalValue: 0,
            createdAt: new Date().toISOString(),
          };
        } else {
          throw error;
        }
      }

      // Ensure cost fields exist in existing documents
      if (!stockDoc.averageCost) stockDoc.averageCost = 0;
      if (!stockDoc.lastPurchaseCost) stockDoc.lastPurchaseCost = 0;
      if (!stockDoc.totalValue) stockDoc.totalValue = 0;

      // Adjust quantities and costs based on type
      const now = new Date().toISOString();
      const oldQuantity = stockDoc.quantityOnHand || 0;
      const oldTotalValue = stockDoc.totalValue || 0;

      if (type === 'in') {
        // Stock increase - update quantities and recalculate weighted average cost
        const newQuantity = oldQuantity + quantity;
        stockDoc.quantityOnHand = newQuantity;
        stockDoc.quantityAvailable =
          (stockDoc.quantityAvailable || 0) + quantity;

        // Update costs with weighted average
        if (purchaseCost !== undefined && purchaseCost > 0) {
          const newTotalValue = oldTotalValue + quantity * purchaseCost;
          stockDoc.averageCost =
            newQuantity > 0 ? newTotalValue / newQuantity : 0;
          stockDoc.totalValue = newTotalValue;
          stockDoc.lastPurchaseCost = purchaseCost;
        }
      } else if (type === 'out') {
        // Stock decrease - reduce quantities and total value
        stockDoc.quantityOnHand = oldQuantity - quantity;
        stockDoc.quantityAvailable =
          (stockDoc.quantityAvailable || 0) - quantity;

        // Reduce total value based on average cost
        stockDoc.totalValue = Math.max(
          0,
          oldTotalValue - quantity * stockDoc.averageCost,
        );
      } else if (type === 'adjustment') {
        // Manual correction - set to exact quantity
        const diff = quantity - oldQuantity;
        stockDoc.quantityOnHand = quantity;
        stockDoc.quantityAvailable = (stockDoc.quantityAvailable || 0) + diff;

        // Adjust total value proportionally
        if (quantity > 0 && oldQuantity > 0) {
          stockDoc.totalValue = (oldTotalValue / oldQuantity) * quantity;
        } else if (quantity === 0) {
          stockDoc.totalValue = 0;
        }
      }

      // Recalculate average cost based on new total value
      if (stockDoc.quantityOnHand > 0) {
        stockDoc.averageCost = stockDoc.totalValue / stockDoc.quantityOnHand;
      } else {
        stockDoc.averageCost = stockDoc.lastPurchaseCost || 0;
      }

      stockDoc.updatedAt = now;
      stockDoc.lastAdjustment = {
        type,
        quantity,
        reason,
        referenceId: referenceId || null,
        referenceType: referenceType || null,
        location: location || null,
        notes: notes || null,
        adjustedBy: { userId, userName },
        adjustedAt: now,
      };

      const result = await this.db.insert(stockDoc);
      stockDoc['_rev'] = result.rev;

      await this.logsService.record(
        tenantId,
        { userId, name: userName },
        'stock.adjust',
        'stock',
        productId,
        { type, quantity, reason, referenceId, referenceType },
      );

      return stockDoc;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('stock.adjust_failed');
    }
  }

  async getLowStockProducts(tenantId: string) {
    try {
      // Get all products with minimum stock level set
      const productsQuery = {
        selector: {
          type: 'product',
          minimumStockLevel: { $gt: 0 },
        },
      };
      const productsResult = await this.db.partitionedFind(
        tenantId,
        productsQuery,
      );

      // Get all stock records
      const stockQuery = {
        selector: {
          type: 'stock',
        },
      };
      const stockResult = await this.db.partitionedFind(tenantId, stockQuery);

      // Create a map of stock levels
      const stockMap = new Map();
      stockResult.docs.forEach((stock: any) => {
        stockMap.set(stock.productId, stock);
      });

      // Find products below minimum level
      const lowStockProducts = productsResult.docs
        .map((product: any) => {
          const stock = stockMap.get(product.productId) || {
            quantityAvailable: 0,
            quantityOnHand: 0,
          };
          const minimumLevel = product.minimumStockLevel || 0;
          const currentStock = stock.quantityAvailable || 0;

          if (currentStock < minimumLevel) {
            return {
              productId: product.productId,
              sku: product.sku,
              name: product.name,
              currentStock,
              minimumLevel,
              shortfall: minimumLevel - currentStock,
            };
          }
          return null;
        })
        .filter((item: any) => item !== null);

      return lowStockProducts;
    } catch (error) {
      throw new InternalServerErrorException('stock.query_failed');
    }
  }

  async getStockByLocation(tenantId: string, location: string) {
    try {
      const query = {
        selector: {
          type: 'stock',
          'lastAdjustment.location': location,
        },
      };
      const result = await this.db.partitionedFind(tenantId, query);
      return result.docs;
    } catch (error) {
      throw new InternalServerErrorException('stock.query_failed');
    }
  }

  async getAllStock(tenantId: string) {
    try {
      const query = {
        selector: {
          type: 'stock',
        },
      };
      const result = await this.db.partitionedFind(tenantId, query);
      return result.docs;
    } catch (error) {
      throw new InternalServerErrorException('stock.list_failed');
    }
  }
}
