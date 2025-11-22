import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { DatabaseModule } from '../database/database.module';
import { MailService } from './mail.service';
import { LogsModule } from '../logs/logs.module';

@Module({
  providers: [UsersService, MailService],
  imports: [DatabaseModule, LogsModule],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule { }
