import {
  Injectable,
  Inject,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { DocumentScope } from 'nano';
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
            createdAt: new Date().toISOString(),
          };
        } else {
          throw error;
        }
      }

      // Adjust quantities based on type
      const now = new Date().toISOString();
      if (type === 'in') {
        stockDoc.quantityOnHand = (stockDoc.quantityOnHand || 0) + quantity;
        stockDoc.quantityAvailable =
          (stockDoc.quantityAvailable || 0) + quantity;
      } else if (type === 'out') {
        stockDoc.quantityOnHand = (stockDoc.quantityOnHand || 0) - quantity;
        stockDoc.quantityAvailable =
          (stockDoc.quantityAvailable || 0) - quantity;
      } else if (type === 'adjustment') {
        // For adjustment, set to exact quantity
        const diff = quantity - (stockDoc.quantityOnHand || 0);
        stockDoc.quantityOnHand = quantity;
        stockDoc.quantityAvailable = (stockDoc.quantityAvailable || 0) + diff;
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
