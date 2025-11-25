import {
  Controller,
  Post,
  Get,
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
import { StockService } from './stock.service';
import { AdjustStockDto } from './dto/adjust-stock.dto';

@Controller('api/v1/stock')
@UseGuards(AuthGuard, PermissionsGuard)
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @Get('level/:productId')
  @RequirePermissions(Permission.PRODUCTS_VIEW)
  async getCurrentLevel(@Req() req, @Param('productId') productId: string) {
    const { tenantId } = req.user;
    return this.stockService.getCurrentLevel(tenantId, productId);
  }

  @Post('adjust')
  @RequirePermissions(Permission.PRODUCTS_UPDATE)
  async adjustStock(@Req() req, @Body() adjustStockDto: AdjustStockDto) {
    const { tenantId, userId, userName } = req.user;
    return this.stockService.adjustStock(tenantId, userId, userName, adjustStockDto);
  }

  @Get('low-stock')
  @RequirePermissions(Permission.PRODUCTS_VIEW)
  async getLowStockProducts(@Req() req) {
    const { tenantId } = req.user;
    return this.stockService.getLowStockProducts(tenantId);
  }

  @Get('location/:location')
  @RequirePermissions(Permission.PRODUCTS_VIEW)
  async getStockByLocation(@Req() req, @Param('location') location: string) {
    const { tenantId } = req.user;
    return this.stockService.getStockByLocation(tenantId, location);
  }

  @Get()
  @RequirePermissions(Permission.PRODUCTS_VIEW)
  async getAllStock(@Req() req) {
    const { tenantId } = req.user;
    return this.stockService.getAllStock(tenantId);
  }
}
