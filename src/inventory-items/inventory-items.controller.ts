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
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { Permission } from '../auth/permissions.enum';
import { InventoryItemsService } from './inventory-items.service';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';
import { CreateOpeningStockDto } from './dto/opening-stock.dto';

@Controller('api/v1/inventory-items')
@UseGuards(AuthGuard, PermissionsGuard)
export class InventoryItemsController {
  constructor(private readonly inventoryItemsService: InventoryItemsService) { }

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

  // Opening Stock Endpoints
  @Post('opening-stock')
  @RequirePermissions(Permission.PRODUCTS_CREATE)
  async createOpeningStock(
    @Req() req,
    @Body() createDto: CreateOpeningStockDto,
  ) {
    const { tenantId, userId, userName } = req.user;
    return this.inventoryItemsService.createOpeningStock(
      tenantId,
      userId,
      userName,
      createDto,
    );
  }

  @Get('opening-stock')
  @RequirePermissions(Permission.PRODUCTS_VIEW)
  async listOpeningStock(
    @Req() req,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ) {
    const { tenantId } = req.user;
    return this.inventoryItemsService.listOpeningStock(
      tenantId,
      limit ? parseInt(limit, 10) : 50,
      skip ? parseInt(skip, 10) : 0,
    );
  }

  @Get('opening-stock/:id')
  @RequirePermissions(Permission.PRODUCTS_VIEW)
  async getOpeningStock(@Req() req, @Param('id') id: string) {
    const { tenantId } = req.user;
    return this.inventoryItemsService.getOpeningStock(tenantId, id);
  }

  @Get('opening-stock/template/download')
  @RequirePermissions(Permission.PRODUCTS_VIEW)
  async downloadTemplate(@Res() res: Response) {
    // Generate Excel template
    const XLSX = require('xlsx');

    const templateData = [
      {
        'Product ID/SKU': '',
        'Quantity': '',
        'Unit Cost': '',
        'Location': 'default',
        'Batch Number': '(optional)',
        'Expiry Date': '(optional, YYYY-MM-DD)',
        'Manufacture Date': '(optional, YYYY-MM-DD)',
        'Serial Numbers': '(optional, comma-separated)',
        'Notes': '(optional)',
      },
      {
        'Product ID/SKU': 'PROD-001',
        'Quantity': '100',
        'Unit Cost': '25.50',
        'Location': 'warehouse-1',
        'Batch Number': 'BATCH-2025-001',
        'Expiry Date': '2026-12-31',
        'Manufacture Date': '2025-11-01',
        'Serial Numbers': '',
        'Notes': 'Initial stock',
      },
      {
        'Product ID/SKU': 'PROD-002',
        'Quantity': '3',
        'Unit Cost': '500.00',
        'Location': 'store',
        'Batch Number': '',
        'Expiry Date': '',
        'Manufacture Date': '',
        'Serial Numbers': 'SN001,SN002,SN003',
        'Notes': 'Serialized items',
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Opening Stock');

    // Set column widths
    worksheet['!cols'] = [
      { wch: 20 },
      { wch: 10 },
      { wch: 12 },
      { wch: 15 },
      { wch: 20 },
      { wch: 20 },
      { wch: 20 },
      { wch: 30 },
      { wch: 20 },
    ];

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=opening-stock-template.xlsx',
    );
    res.send(buffer);
  }

  @Post('opening-stock/import')
  @RequirePermissions(Permission.PRODUCTS_CREATE)
  @UseInterceptors(FileInterceptor('file'))
  async importOpeningStock(
    @Req() req,
    @UploadedFile() file: any,
    @Body('entryDate') entryDate: string,
    @Body('notes') notes?: string,
  ) {
    const { tenantId, userId, userName } = req.user;

    if (!file) {
      throw new Error('No file uploaded');
    }

    const XLSX = require('xlsx');
    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(worksheet);

    // Skip header row and process data
    const items = jsonData.slice(1).map((row: any) => {
      const item: any = {
        productId: row['Product ID/SKU'],
        quantity: parseFloat(row['Quantity']),
        unitCost: parseFloat(row['Unit Cost']),
        location: row['Location'] || 'default',
      };

      if (row['Batch Number'] && row['Batch Number'] !== '(optional)') {
        item.batchNumber = row['Batch Number'];
      }

      if (row['Expiry Date'] && row['Expiry Date'] !== '(optional, YYYY-MM-DD)') {
        item.expiryDate = row['Expiry Date'];
      }

      if (row['Manufacture Date'] && row['Manufacture Date'] !== '(optional, YYYY-MM-DD)') {
        item.manufactureDate = row['Manufacture Date'];
      }

      if (row['Serial Numbers'] && row['Serial Numbers'] !== '(optional, comma-separated)') {
        item.serialNumbers = row['Serial Numbers'].split(',').map((s: string) => s.trim());
      }

      if (row['Notes'] && row['Notes'] !== '(optional)') {
        item.notes = row['Notes'];
      }

      return item;
    }).filter((item: any) => item.productId && item.quantity && item.unitCost);

    const createDto: CreateOpeningStockDto = {
      entryDate,
      items,
      notes,
    };

    return this.inventoryItemsService.createOpeningStock(
      tenantId,
      userId,
      userName,
      createDto,
    );
  }
}
