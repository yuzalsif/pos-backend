import { Module } from '@nestjs/common';
import { SuppliersService } from './suppliers.service';
import { SuppliersController } from './suppliers.controller';
import { DatabaseModule } from '../database/database.module';

@Module({
    providers: [SuppliersService],
    imports: [DatabaseModule],
    controllers: [SuppliersController],
    exports: [SuppliersService],
})
export class SuppliersModule { }
