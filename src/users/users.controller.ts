import {
  Controller,
  Post,
  Patch,
  Get,
  Param,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AuthGuard, type RequestWithUser } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { Permission, DEFAULT_ROLE_PERMISSIONS } from '../auth/permissions.enum';
import { SignupDto } from './dto/signup.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Controller('api/v1/users')
@UseGuards(AuthGuard, PermissionsGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // Protected - only users with USERS_CREATE permission can create users
  @Post()
  @RequirePermissions(Permission.USERS_CREATE)
  create(@Body() createUserDto: CreateUserDto, @Req() req: RequestWithUser) {
    const { tenantId, userId, name } = req.user;

    // pass the authenticated actor into the service so audit logs and createdBy are accurate
    return this.usersService.create(tenantId, createUserDto, { userId, name });
  }

  // Protected - only users with USERS_UPDATE permission can update users
  @Patch(':userId')
  @RequirePermissions(Permission.USERS_UPDATE)
  update(
    @Param('userId') userId: string,
    @Body() updateUserDto: UpdateUserDto,
    @Req() req: RequestWithUser,
  ) {
    const { tenantId, userId: actorId, name } = req.user;

    return this.usersService.update(tenantId, userId, updateUserDto, {
      userId: actorId,
      name,
    });
  }

  // Get available permissions - for UI permission selection
  @Get('permissions')
  @RequirePermissions(Permission.USERS_CREATE, Permission.USERS_UPDATE)
  getAvailablePermissions() {
    const allPermissions = Object.values(Permission).map((permission) => ({
      value: permission,
      label: permission
        .replace(/\./g, ' ')
        .replace(/\b\w/g, (l) => l.toUpperCase()),
    }));

    return {
      allPermissions,
      defaultRolePermissions: DEFAULT_ROLE_PERMISSIONS,
    };
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
