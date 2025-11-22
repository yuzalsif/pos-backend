
import { IsEmail, IsString, MinLength, IsNotEmpty, IsOptional } from 'class-validator';

export class SignupDto {
    // tenantId is optional for owner signup — owners can create a tenant.
    @IsString()
    @IsOptional()
    tenantId?: string;

    @IsEmail()
    email: string;

    @IsString()
    @MinLength(8, { message: 'Password must be at least 8 characters long' })
    password: string;

    @IsString()
    @IsNotEmpty()
    name: string;
}
