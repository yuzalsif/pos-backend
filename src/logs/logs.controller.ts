import { Controller, Get, Param, Query, UseGuards, Req, UnauthorizedException } from '@nestjs/common';
import { LogsService } from './logs.service';
import { AuthGuard, type RequestWithUser } from '../auth/auth.guard';

@Controller('api/v1/:tenantId/logs')
@UseGuards(AuthGuard)
export class LogsController {
    constructor(private readonly logsService: LogsService) { }

    @Get()
    async list(
        @Param('tenantId') tenantId: string,
        @Query('action') action: string,
        @Query('resource') resource: string,
        @Query('userId') userId: string,
        @Query('limit') limit: string,
        @Query('skip') skip: string,
        @Req() req: RequestWithUser,
    ) {
        const { tenantId: userTenant, role } = req.user;
        if (userTenant !== tenantId) {
            throw new UnauthorizedException({ key: 'auth.no_permission' });
        }

        // Allow owners and managers to view logs
        if (role !== 'owner' && role !== 'manager') {
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
