import {
  IsString,
  IsNotEmpty,
  IsNumber,
  Min,
  IsOptional,
  IsIn,
  IsEnum,
} from 'class-validator';
import { StockReferenceType } from '../stock-reference-type.enum';

export class AdjustStockDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsNumber()
  @Min(0)
  quantity: number;

  @IsString()
  @IsIn(['in', 'out', 'adjustment'])
  type: 'in' | 'out' | 'adjustment';

  @IsNumber()
  @Min(0)
  @IsOptional()
  purchaseCost?: number; // Unit cost for this adjustment (required for type='in')

  @IsString()
  @IsNotEmpty()
  reason: string;

  @IsString()
  @IsOptional()
  referenceId?: string; // Link to batch, sale, purchase, etc.

  @IsEnum(StockReferenceType)
  @IsOptional()
  referenceType?: StockReferenceType;

  @IsString()
  @IsOptional()
  location?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
