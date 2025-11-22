import { Controller, Post, Body, Req, UseGuards, UnauthorizedException } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { AuthGuard, type RequestWithUser } from '../auth/auth.guard';
import { SignupDto } from './dto/signup.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Controller('api/v1/users')
export class UsersController {
    constructor(private readonly usersService: UsersService) { }

    // Protected - only authenticated owner/manager can create users
    @UseGuards(AuthGuard)
    @Post()
    create(@Body() createUserDto: CreateUserDto, @Req() req: RequestWithUser) {
        const { tenantId, role } = req.user;

        if (role !== 'owner' && role !== 'manager') {
            throw new UnauthorizedException({ key: 'auth.no_permission' });
        }

        return this.usersService.create(tenantId, createUserDto);
    }

    // Public signup for owner - only allowed if tenant has no owner yet
    @Post('signup-owner')
    signupOwner(@Body() signupDto: SignupDto) {
        return this.usersService.signupOwner(signupDto);
    }

    // Public signup for manager
    @Post('signup-manager')
    signupManager(@Body() signupDto: SignupDto) {
        return this.usersService.signupManager(signupDto);
    }

    // Request a password reset email
    @Post('forgot-password')
    forgotPassword(@Body() payload: ForgotPasswordDto) {
        return this.usersService.forgotPassword(payload);
    }

    // Reset password using token
    @Post('reset-password')
    resetPassword(@Body() payload: ResetPasswordDto) {
        return this.usersService.resetPassword(payload);
    }
}