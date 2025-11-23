import { Controller, Post, Get, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { CreateAccountDto, DepositDto, WithdrawDto, TransferDto } from './dto/account.dto';
import { AuthGuard, type RequestWithUser } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { Permission } from '../auth/permissions.enum';

@Controller('api/v1/accounts')
@UseGuards(AuthGuard, PermissionsGuard)
export class AccountsController {
    constructor(private readonly accountsService: AccountsService) { }

    @Post()
    @RequirePermissions(Permission.ACCOUNTS_CREATE)
    create(@Body() createAccountDto: CreateAccountDto, @Req() req: RequestWithUser) {
        const { tenantId, userId } = req.user;
        return this.accountsService.create(tenantId, userId, createAccountDto);
    }

    @Get()
    @RequirePermissions(Permission.ACCOUNTS_VIEW)
    list(@Req() req: RequestWithUser) {
        const { tenantId } = req.user;
        return this.accountsService.list(tenantId);
    }

    @Get(':id')
    @RequirePermissions(Permission.ACCOUNTS_VIEW)
    get(@Param('id') id: string, @Req() req: RequestWithUser) {
        const { tenantId } = req.user;
        return this.accountsService.get(tenantId, id);
    }

    @Post(':id/deposit')
    @RequirePermissions(Permission.ACCOUNTS_DEPOSIT)
    deposit(
        @Param('id') id: string,
        @Body() depositDto: DepositDto,
        @Req() req: RequestWithUser
    ) {
        const { tenantId, userId } = req.user;
        return this.accountsService.deposit(tenantId, userId, id, depositDto);
    }

    @Post(':id/withdraw')
    @RequirePermissions(Permission.ACCOUNTS_WITHDRAW)
    withdraw(
        @Param('id') id: string,
        @Body() withdrawDto: WithdrawDto,
        @Req() req: RequestWithUser
    ) {
        const { tenantId, userId } = req.user;
        return this.accountsService.withdraw(tenantId, userId, id, withdrawDto);
    }

    @Post('transfer')
    @RequirePermissions(Permission.ACCOUNTS_TRANSFER)
    transfer(@Body() transferDto: TransferDto, @Req() req: RequestWithUser) {
        const { tenantId, userId } = req.user;
        return this.accountsService.transfer(tenantId, userId, transferDto);
    }

    @Get(':id/transactions')
    @RequirePermissions(Permission.ACCOUNTS_VIEW)
    getTransactions(
        @Param('id') id: string,
        @Query('categoryId') categoryId: string | undefined,
        @Query('type') type: 'deposit' | 'withdraw' | 'transfer_in' | 'transfer_out' | undefined,
        @Query('startDate') startDate: string | undefined,
        @Query('endDate') endDate: string | undefined,
        @Req() req: RequestWithUser
    ) {
        const { tenantId } = req.user;
        return this.accountsService.getTransactions(tenantId, {
            accountId: id,
            categoryId,
            type,
            startDate,
            endDate,
        });
    }

    @Get('transactions/all')
    @RequirePermissions(Permission.ACCOUNTS_VIEW)
    getAllTransactions(
        @Query('accountId') accountId: string | undefined,
        @Query('categoryId') categoryId: string | undefined,
        @Query('type') type: 'deposit' | 'withdraw' | 'transfer_in' | 'transfer_out' | undefined,
        @Query('startDate') startDate: string | undefined,
        @Query('endDate') endDate: string | undefined,
        @Req() req: RequestWithUser
    ) {
        const { tenantId } = req.user;
        return this.accountsService.getTransactions(tenantId, {
            accountId,
            categoryId,
            type,
            startDate,
            endDate,
        });
    }
}
