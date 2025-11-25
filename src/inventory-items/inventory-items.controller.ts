import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { Permission } from '../auth/permissions.enum';
import { InventoryItemsService } from './inventory-items.service';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';

@Controller('api/v1/inventory-items')
@UseGuards(AuthGuard, PermissionsGuard)
export class InventoryItemsController {
  constructor(private readonly inventoryItemsService: InventoryItemsService) {}

  @Post()
  @RequirePermissions(Permission.PRODUCTS_CREATE)
  async create(
    @Req() req,
    @Body() createInventoryItemDto: CreateInventoryItemDto,
  ) {
    const { tenantId, userId, userName } = req.user;
    return this.inventoryItemsService.create(
      tenantId,
      userId,
      userName,
      createInventoryItemDto,
    );
  }

  @Get('serial/:serialNumber')
  @RequirePermissions(Permission.PRODUCTS_VIEW)
  async findBySerial(@Req() req, @Param('serialNumber') serialNumber: string) {
    const { tenantId } = req.user;
    return this.inventoryItemsService.findBySerial(tenantId, serialNumber);
  }

  @Get('available/:productId')
  @RequirePermissions(Permission.PRODUCTS_VIEW)
  async findAvailableByProduct(
    @Req() req,
    @Param('productId') productId: string,
  ) {
    const { tenantId } = req.user;
    return this.inventoryItemsService.findAvailableByProduct(
      tenantId,
      productId,
    );
  }

  @Get(':id')
  @RequirePermissions(Permission.PRODUCTS_VIEW)
  async findOne(@Req() req, @Param('id') id: string) {
    const { tenantId } = req.user;
    return this.inventoryItemsService.findOne(tenantId, id);
  }

  @Get()
  @RequirePermissions(Permission.PRODUCTS_VIEW)
  async findAll(
    @Req() req,
    @Query('productId') productId?: string,
    @Query('status') status?: string,
    @Query('batchId') batchId?: string,
  ) {
    const { tenantId } = req.user;
    const filters = { productId, status, batchId };
    return this.inventoryItemsService.findAll(tenantId, filters);
  }

  @Patch(':id')
  @RequirePermissions(Permission.PRODUCTS_UPDATE)
  async update(
    @Req() req,
    @Param('id') id: string,
    @Body() updateInventoryItemDto: UpdateInventoryItemDto,
  ) {
    const { tenantId, userId, userName } = req.user;
    return this.inventoryItemsService.update(
      tenantId,
      userId,
      userName,
      id,
      updateInventoryItemDto,
    );
  }
}
