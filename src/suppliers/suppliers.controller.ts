import { Controller, Post, Body, Req, UseGuards, Get, Param, UnauthorizedException } from '@nestjs/common';
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { AuthGuard, type RequestWithUser } from '../auth/auth.guard';

@Controller('api/v1/:tenantId/suppliers')
@UseGuards(AuthGuard)
export class SuppliersController {
    constructor(private readonly suppliersService: SuppliersService) { }

    @Post()
    async create(@Param('tenantId') tenantId: string, @Body() dto: CreateSupplierDto, @Req() req: RequestWithUser) {
        const { tenantId: userTenant, role, userId } = req.user;

        if (userTenant !== tenantId) {
            throw new UnauthorizedException({ key: 'auth.no_permission' });
        }

        if (role !== 'owner' && role !== 'manager') {
            throw new UnauthorizedException({ key: 'auth.no_permission' });
        }

        return this.suppliersService.create(tenantId, dto, userId);
    }

    @Get()
    async list(@Param('tenantId') tenantId: string, @Req() req: RequestWithUser) {
        const { tenantId: userTenant, role } = req.user;

        if (userTenant !== tenantId) {
            throw new UnauthorizedException({ key: 'auth.no_permission' });
        }

        // any authenticated user within the tenant can list suppliers
        return this.suppliersService.findAll(tenantId);
    }
}
