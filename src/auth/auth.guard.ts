import {
    Injectable,
    CanActivate,
    ExecutionContext,
    UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import * as jwt from 'jsonwebtoken';
import { ConfigService } from '@nestjs/config';

export interface UserPayload {
    userId: string;
    tenantId: string;
    name: string;
    role: 'cashier' | 'manager' | 'owner';
}

export interface RequestWithUser extends Request {
    user: UserPayload;
}

@Injectable()
export class AuthGuard implements CanActivate {
    private readonly jwtSecret: string;

    constructor(private configService: ConfigService) {
        const secret = this.configService.get<string>('JWT_SECRET');

        if (!secret) {
            throw new Error('FATAL ERROR: JWT_SECRET is not defined in the environment variables.');
        }

        this.jwtSecret = secret;
    }

    canActivate(context: ExecutionContext): boolean {
        const request: RequestWithUser = context.switchToHttp().getRequest();
        const token = this.extractTokenFromHeader(request);

        if (!token) {
            throw new UnauthorizedException({ key: 'auth.token_not_found' });
        }

        try {

            const decodedPayload: unknown = jwt.verify(token, this.jwtSecret);

            if (!this.isValidPayload(decodedPayload)) {
                throw new UnauthorizedException({ key: 'auth.invalid_token_payload' });
            }

            request.user = decodedPayload;

        } catch (error) {
            if (error instanceof jwt.TokenExpiredError) {
                throw new UnauthorizedException({ key: 'auth.token_expired' });
            }
            if (error instanceof jwt.JsonWebTokenError) {
                throw new UnauthorizedException({ key: 'auth.invalid_token' });
            }
            throw error;
        }
        return true;
    }

    private extractTokenFromHeader(request: Request): string | undefined {
        const [type, token] = request.headers.authorization?.split(' ') ?? [];
        return type === 'Bearer' ? token : undefined;
    }

    private isValidPayload(payload: unknown): payload is UserPayload {
        if (typeof payload !== 'object' || payload === null) {
            return false;
        }

        const p = payload as Record<string, unknown>;

        return (
            typeof p.userId === 'string' &&
            typeof p.tenantId === 'string' &&
            typeof p.name === 'string' &&
            (p.role === 'cashier' || p.role === 'manager' || p.role === 'owner')
        );
    }
}