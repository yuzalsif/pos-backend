import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
} from 'class-validator';

export class CreateUomDto {
  @IsString()
  @IsNotEmpty()
  code: string; // short code, e.g., 'piece', 'dozen'

  @IsString()
  @IsNotEmpty()
  name: string; // human-friendly name

  @IsOptional()
  @IsNumber()
  @Min(0.000001)
  toBaseFactor?: number; // multiply this unit to get base unit quantity (base unit = 1)

  @IsOptional()
  description?: string;

  @IsOptional()
  baseUnit?: boolean;

  @IsOptional()
  @IsString()
  baseUomId?: string; // reference to the base UoM id (supports multiple base groups)
}
