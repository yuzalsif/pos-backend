import { Controller, Post, Body, Req, UseGuards, UnauthorizedException } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { AuthGuard, type RequestWithUser } from '../auth/auth.guard';

@Controller('api/v1/users')
@UseGuards(AuthGuard)
export class UsersController {
    constructor(private readonly usersService: UsersService) { }

    @Post()
    create(@Body() createUserDto: CreateUserDto, @Req() req: RequestWithUser) {
        const { tenantId, role } = req.user;

        if (role !== 'owner' && role !== 'manager') {
            throw new UnauthorizedException('You do not have permission to create users.');
        }

        return this.usersService.create(tenantId, createUserDto);
    }
}