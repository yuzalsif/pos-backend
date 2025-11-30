import { Module } from '@nestjs/common';
import { InventoryItemsService } from './inventory-items.service';
import { InventoryItemsController } from './inventory-items.controller';
import { DatabaseModule } from '../database/database.module';
import { LogsModule } from '../logs/logs.module';
import { BatchesModule } from '../batches/batches.module';
import { StockModule } from '../stock/stock.module';

@Module({
  imports: [DatabaseModule, LogsModule, BatchesModule, StockModule],
  providers: [InventoryItemsService],
  controllers: [InventoryItemsController],
  exports: [InventoryItemsService],
})
export class InventoryItemsModule { }
