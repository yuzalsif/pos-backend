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

    @IsIn(['attendant', 'manager', 'owner'])
    role: 'attendant' | 'manager' | 'owner';
}