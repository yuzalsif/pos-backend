import { Controller, Post, Body, Req, UseGuards, Get, Param, UnauthorizedException } from '@nestjs/common';
import { UomsService } from './uoms.service';
import { CreateUomDto } from './dto/create-uom.dto';
import { AuthGuard, type RequestWithUser } from '../auth/auth.guard';

@Controller('api/v1/:tenantId/uoms')
@UseGuards(AuthGuard)
export class UomsController {
  constructor(private readonly uomsService: UomsService) {}

  @Post()
  async create(@Param('tenantId') tenantId: string, @Body() dto: CreateUomDto, @Req() req: RequestWithUser) {
    const { tenantId: userTenant, role, userId } = req.user;

    if (userTenant !== tenantId) {
      throw new UnauthorizedException({ key: 'auth.no_permission' });
    }

    if (role !== 'owner' && role !== 'manager') {
      throw new UnauthorizedException({ key: 'auth.no_permission' });
    }

    return this.uomsService.create(tenantId, userId, dto);
  }

  @Get()
  async list(@Param('tenantId') tenantId: string, @Req() req: RequestWithUser) {
    const { tenantId: userTenant } = req.user;

    if (userTenant !== tenantId) {
      throw new UnauthorizedException({ key: 'auth.no_permission' });
    }

    return this.uomsService.findAll(tenantId);
  }
}
