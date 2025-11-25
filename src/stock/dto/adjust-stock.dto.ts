import {
  IsString,
  IsNotEmpty,
  IsNumber,
  Min,
  IsOptional,
  IsIn,
} from 'class-validator';

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

  @IsString()
  @IsNotEmpty()
  reason: string;

  @IsString()
  @IsOptional()
  referenceId?: string; // Link to batch, sale, purchase, etc.

  @IsString()
  @IsOptional()
  referenceType?: string; // 'batch', 'sale', 'purchase', 'damage', 'return'

  @IsString()
  @IsOptional()
  location?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
