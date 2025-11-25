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
import { UomsService } from './uoms.service';
import { CreateUomDto } from './dto/create-uom.dto';
import { AuthGuard, type RequestWithUser } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { Permission } from '../auth/permissions.enum';

@Controller('api/v1/:tenantId/uoms')
@UseGuards(AuthGuard, PermissionsGuard)
export class UomsController {
  constructor(private readonly uomsService: UomsService) {}

  @Post()
  @RequirePermissions(Permission.UOMS_CREATE)
  async create(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateUomDto,
    @Req() req: RequestWithUser,
  ) {
    const { tenantId: userTenant, userId } = req.user;

    if (userTenant !== tenantId) {
      throw new UnauthorizedException({ key: 'auth.no_permission' });
    }

    return this.uomsService.create(tenantId, userId, dto);
  }

  @Get()
  @RequirePermissions(Permission.UOMS_VIEW)
  async list(@Param('tenantId') tenantId: string, @Req() req: RequestWithUser) {
    const { tenantId: userTenant } = req.user;

    if (userTenant !== tenantId) {
      throw new UnauthorizedException({ key: 'auth.no_permission' });
    }

    return this.uomsService.findAll(tenantId);
  }
}
