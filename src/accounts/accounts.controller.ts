import { Controller, Post, Get, Body, Param, Query, Req, UseGuards, UnauthorizedException } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { CreateAccountDto, DepositDto, WithdrawDto, TransferDto } from './dto/account.dto';
import { AuthGuard, type RequestWithUser } from '../auth/auth.guard';

@Controller('api/v1/accounts')
@UseGuards(AuthGuard)
export class AccountsController {
    constructor(private readonly accountsService: AccountsService) { }

    @Post()
    create(@Body() createAccountDto: CreateAccountDto, @Req() req: RequestWithUser) {
        const { tenantId, userId, role } = req.user;

        if (role !== 'owner' && role !== 'manager') {
            throw new UnauthorizedException({ key: 'auth.no_permission' });
        }

        return this.accountsService.create(tenantId, userId, createAccountDto);
    }

    @Get()
    list(@Req() req: RequestWithUser) {
        const { tenantId } = req.user;
        return this.accountsService.list(tenantId);
    }

    @Get(':id')
    get(@Param('id') id: string, @Req() req: RequestWithUser) {
        const { tenantId } = req.user;
        return this.accountsService.get(tenantId, id);
    }

    @Post(':id/deposit')
    deposit(
        @Param('id') id: string,
        @Body() depositDto: DepositDto,
        @Req() req: RequestWithUser
    ) {
        const { tenantId, userId, role } = req.user;

        if (role !== 'owner' && role !== 'manager' && role !== 'cashier') {
            throw new UnauthorizedException({ key: 'auth.no_permission' });
        }

        return this.accountsService.deposit(tenantId, userId, id, depositDto);
    }

    @Post(':id/withdraw')
    withdraw(
        @Param('id') id: string,
        @Body() withdrawDto: WithdrawDto,
        @Req() req: RequestWithUser
    ) {
        const { tenantId, userId, role } = req.user;

        if (role !== 'owner' && role !== 'manager' && role !== 'cashier') {
            throw new UnauthorizedException({ key: 'auth.no_permission' });
        }

        return this.accountsService.withdraw(tenantId, userId, id, withdrawDto);
    }

    @Post('transfer')
    transfer(@Body() transferDto: TransferDto, @Req() req: RequestWithUser) {
        const { tenantId, userId, role } = req.user;

        if (role !== 'owner' && role !== 'manager') {
            throw new UnauthorizedException({ key: 'auth.no_permission' });
        }

        return this.accountsService.transfer(tenantId, userId, transferDto);
    }

    @Get(':id/transactions')
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
