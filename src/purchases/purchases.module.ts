import { Module } from '@nestjs/common';
import { PurchasesController } from './purchases.controller';
import { PurchasesService } from './purchases.service';
import { DatabaseModule } from '../database/database.module';
import { LogsModule } from '../logs/logs.module';
import { UsersModule } from '../users/users.module';

@Module({
    imports: [DatabaseModule, LogsModule, UsersModule],
    controllers: [PurchasesController],
    providers: [PurchasesService],
    exports: [PurchasesService],
})
export class PurchasesModule { }
