import {
  IsEmail,
  IsString,
  MinLength,
  IsNotEmpty,
  IsIn,
  IsArray,
  IsOptional,
} from 'class-validator';

export class UpdateUserDto {
  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @IsOptional()
  password?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  name?: string;

  @IsIn(['attendant', 'manager', 'owner'])
  @IsOptional()
  role?: 'attendant' | 'manager' | 'owner';

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  permissions?: string[];
}
