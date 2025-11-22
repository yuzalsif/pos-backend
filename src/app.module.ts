import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ProductsModule } from './products/products.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { DatabaseModule } from './database/database.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { I18nModule } from './i18n/i18n.module';
import { UomsModule } from './uoms/uoms.module';
import { LogsModule } from './logs/logs.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    I18nModule,
    ProductsModule,
    AuthModule,
    UsersModule,
    SuppliersModule,
    UomsModule,
    LogsModule,
    DatabaseModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
