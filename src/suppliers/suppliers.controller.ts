import {
  Controller,
  Post,
  Body,
  Req,
  UseGuards,
  Get,
  Param,
  UnauthorizedException,
} from '@nestjs/common';
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { AuthGuard, type RequestWithUser } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { Permission } from '../auth/permissions.enum';

@Controller('api/v1/:tenantId/suppliers')
@UseGuards(AuthGuard, PermissionsGuard)
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Post()
  @RequirePermissions(Permission.SUPPLIERS_CREATE)
  async create(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateSupplierDto,
    @Req() req: RequestWithUser,
  ) {
    const { tenantId: userTenant, userId } = req.user;

    if (userTenant !== tenantId) {
      throw new UnauthorizedException({ key: 'auth.no_permission' });
    }

    return this.suppliersService.create(tenantId, dto, userId);
  }

  @Get()
  @RequirePermissions(Permission.SUPPLIERS_VIEW)
  async list(@Param('tenantId') tenantId: string, @Req() req: RequestWithUser) {
    const { tenantId: userTenant } = req.user;

    if (userTenant !== tenantId) {
      throw new UnauthorizedException({ key: 'auth.no_permission' });
    }

    return this.suppliersService.findAll(tenantId);
  }
}
