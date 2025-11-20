import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt'; 
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { UserPayload } from './auth.guard';

@Injectable()
export class AuthService {
    constructor(
        private readonly usersService: UsersService,
        private readonly jwtService: JwtService,
    ) { }

    async validateUser(tenantId: string, email: string, pass: string): Promise<any> {
        const user = await this.usersService.findByEmail(tenantId, email);
        if (user && await bcrypt.compare(pass, user.passwordHash)) {
            const { passwordHash, ...result } = user;
            return result;
        }
        return null;
    }

    async login(user: any) {
        const payload: UserPayload = {
            userId: user._id.split(':')[2],
            tenantId: user.tenantId,
            name: user.name,
            role: user.role,
        };
        return {
            accessToken: this.jwtService.sign(payload),
        };
    }
}