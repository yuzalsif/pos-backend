import { Type } from 'class-transformer';
import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsArray,
  ValidateNested,
  Min,
  ArrayMinSize,
} from 'class-validator';

class PriceTiersDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  retail?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  wholesale?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  dealer?: number;
}

class ProductUnitDto {
  @IsOptional()
  @IsString()
  uomId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  factor?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => PriceTiersDto)
  priceTiers?: PriceTiersDto;
}

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountAmount?: number;

  @IsOptional()
  @IsBoolean()
  purchase?: boolean;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ProductUnitDto)
  unitsOfMeasure?: ProductUnitDto[];
}
