import { Module } from '@nestjs/common';
import { BatchesService } from './batches.service';
import { BatchesController } from './batches.controller';
import { DatabaseModule } from '../database/database.module';
import { LogsModule } from '../logs/logs.module';
import { StockModule } from '../stock/stock.module';

@Module({
  imports: [DatabaseModule, LogsModule, StockModule],
  providers: [BatchesService],
  controllers: [BatchesController],
  exports: [BatchesService],
})
export class BatchesModule {}
