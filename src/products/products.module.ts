import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  controllers: [ProductsController],
  imports: [DatabaseModule],
  providers: [ProductsService],
})
export class ProductsModule {}
