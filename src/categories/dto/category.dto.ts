import { IsString, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(['income', 'expense'])
  @IsNotEmpty()
  type: 'income' | 'expense';

  @IsString()
  @IsOptional()
  parentCategoryId?: string;

  @IsString()
  @IsOptional()
  description?: string;
}

export class UpdateCategoryDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;
}
