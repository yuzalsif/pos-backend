import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { BatchesService } from './batches.service';
import { CreateBatchDto } from './dto/create-batch.dto';
import { AuthGuard, type RequestWithUser } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { Permission } from '../auth/permissions.enum';

@Controller('api/v1/batches')
@UseGuards(AuthGuard, PermissionsGuard)
export class BatchesController {
  constructor(private readonly batchesService: BatchesService) {}

  @Post()
  @RequirePermissions(Permission.PRODUCTS_CREATE)
  create(@Body() createBatchDto: CreateBatchDto, @Req() req: RequestWithUser) {
    const { tenantId, userId, name } = req.user;
    return this.batchesService.create(tenantId, userId, name, createBatchDto);
  }

  @Get()
  @RequirePermissions(Permission.PRODUCTS_VIEW)
  findAll(@Query('productId') productId: string, @Req() req: RequestWithUser) {
    const { tenantId } = req.user;
    return this.batchesService.findAll(tenantId, productId);
  }

  @Get('available/:productId')
  @RequirePermissions(Permission.PRODUCTS_VIEW)
  findAvailable(
    @Param('productId') productId: string,
    @Req() req: RequestWithUser,
  ) {
    const { tenantId } = req.user;
    return this.batchesService.findAvailable(tenantId, productId);
  }

  @Get('expiring')
  @RequirePermissions(Permission.PRODUCTS_VIEW)
  findExpiring(@Query('days') days: string, @Req() req: RequestWithUser) {
    const { tenantId } = req.user;
    const withinDays = days ? parseInt(days, 10) : 30;
    return this.batchesService.findExpiring(tenantId, withinDays);
  }

  @Get(':id')
  @RequirePermissions(Permission.PRODUCTS_VIEW)
  findOne(@Param('id') id: string, @Req() req: RequestWithUser) {
    const { tenantId } = req.user;
    return this.batchesService.findOne(tenantId, id);
  }
}
