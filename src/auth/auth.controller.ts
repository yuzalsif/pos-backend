import { Controller, Post, Body, UnauthorizedException, Param } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from '../users/dto/login.dto';

@Controller('api/v1/:tenantId/auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Post('login')
    async login(@Param('tenantId') tenantId: string, @Body() loginDto: LoginDto) {
        const user = await this.authService.validateUser(tenantId, loginDto.email, loginDto.password);
        if (!user) {
            throw new UnauthorizedException('Invalid credentials.');
        }
        return this.authService.login(user);
    }
}