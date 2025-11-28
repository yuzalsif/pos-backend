import {
    Controller,
    Post,
    Get,
    Put,
    Param,
    Body,
    Query,
    UseGuards,
    Request,
} from '@nestjs/common';
import { PurchasesService } from './purchases.service';
import { AuthGuard } from '../auth/auth.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { Permission } from '../auth/permissions.enum';
import {
    CreatePurchaseOrderDto,
    UpdatePurchaseOrderDto,
    ChangePurchaseOrderStatusDto,
    SendPurchaseOrderEmailDto,
} from './dto/create-purchase-order.dto';
import { PurchaseOrderStatus } from './purchases.types';

@Controller('purchases')
@UseGuards(AuthGuard)
export class PurchasesController {
    constructor(private readonly purchasesService: PurchasesService) { }

    @Post()
    @RequirePermissions(Permission.PURCHASES_CREATE)
    async create(@Request() req, @Body() createDto: CreatePurchaseOrderDto) {
        return this.purchasesService.create(
            req.tenantId,
            req.userId,
            req.userName,
            createDto,
        );
    }

    @Get()
    @RequirePermissions(Permission.PURCHASES_VIEW)
    async findAll(
        @Request() req,
        @Query('status') status?: PurchaseOrderStatus,
        @Query('supplierId') supplierId?: string,
        @Query('limit') limit?: string,
        @Query('skip') skip?: string,
    ) {
        return this.purchasesService.findAll(
            req.tenantId,
            status,
            supplierId,
            limit ? parseInt(limit, 10) : 50,
            skip ? parseInt(skip, 10) : 0,
        );
    }

    @Get('number/:poNumber')
    @RequirePermissions(Permission.PURCHASES_VIEW)
    async findByNumber(@Request() req, @Param('poNumber') poNumber: string) {
        return this.purchasesService.findByNumber(req.tenantId, poNumber);
    }

    @Get(':id')
    @RequirePermissions(Permission.PURCHASES_VIEW)
    async findOne(@Request() req, @Param('id') id: string) {
        return this.purchasesService.findOne(req.tenantId, id);
    }

    @Put(':id')
    @RequirePermissions(Permission.PURCHASES_UPDATE)
    async update(
        @Request() req,
        @Param('id') id: string,
        @Body() updateDto: UpdatePurchaseOrderDto,
    ) {
        return this.purchasesService.update(
            req.tenantId,
            req.userId,
            req.userName,
            id,
            updateDto,
        );
    }

    @Put(':id/status')
    @RequirePermissions(Permission.PURCHASES_UPDATE)
    async changeStatus(
        @Request() req,
        @Param('id') id: string,
        @Body() statusDto: ChangePurchaseOrderStatusDto,
    ) {
        return this.purchasesService.changeStatus(
            req.tenantId,
            req.userId,
            req.userName,
            id,
            statusDto,
        );
    }

    @Post(':id/send-email')
    @RequirePermissions(Permission.PURCHASES_UPDATE)
    async sendEmail(
        @Request() req,
        @Param('id') id: string,
        @Body() emailDto: SendPurchaseOrderEmailDto,
    ) {
        return this.purchasesService.sendEmail(
            req.tenantId,
            req.userId,
            req.userName,
            id,
            emailDto,
        );
    }
}
