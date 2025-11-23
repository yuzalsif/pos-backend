import { Module } from '@nestjs/common';
import { InventoryItemsService } from './inventory-items.service';
import { InventoryItemsController } from './inventory-items.controller';
import { DatabaseModule } from '../database/database.module';
import { LogsModule } from '../logs/logs.module';

@Module({
  imports: [DatabaseModule, LogsModule],
  providers: [InventoryItemsService],
  controllers: [InventoryItemsController],
  exports: [InventoryItemsService],
})
export class InventoryItemsModule { }
