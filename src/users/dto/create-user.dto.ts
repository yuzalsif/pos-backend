import { IsEmail, IsString, MinLength, IsNotEmpty, IsIn } from 'class-validator';

export class CreateUserDto {
    @IsEmail()
    email: string;

    @IsString()
    @MinLength(8, { message: 'Password must be at least 8 characters long' })
    password: string;

    @IsString()
    @IsNotEmpty()
    name: string;

    @IsIn(['cashier', 'manager', 'owner'])
    role: 'cashier' | 'manager' | 'owner';
}