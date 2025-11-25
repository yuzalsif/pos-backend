import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { LogsService } from './logs.service';
import { AuthGuard, type RequestWithUser } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { Permission } from '../auth/permissions.enum';

@Controller('api/v1/:tenantId/logs')
@UseGuards(AuthGuard, PermissionsGuard)
export class LogsController {
  constructor(private readonly logsService: LogsService) {}

  @Get()
  @RequirePermissions(Permission.LOGS_VIEW)
  async list(
    @Param('tenantId') tenantId: string,
    @Query('action') action: string,
    @Query('resource') resource: string,
    @Query('userId') userId: string,
    @Query('limit') limit: string,
    @Query('skip') skip: string,
    @Req() req: RequestWithUser,
  ) {
    const { tenantId: userTenant } = req.user;
    if (userTenant !== tenantId) {
      throw new UnauthorizedException({ key: 'auth.no_permission' });
    }

    const opts: any = {};
    if (action) opts.action = action;
    if (resource) opts.resource = resource;
    if (userId) opts.userId = userId;
    if (limit) opts.limit = parseInt(limit, 10);
    if (skip) opts.skip = parseInt(skip, 10);

    return this.logsService.findAll(tenantId, opts);
  }
}
