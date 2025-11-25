import { IsString, IsOptional, IsIn, IsDateString } from 'class-validator';

export class UpdateInventoryItemDto {
  @IsOptional()
  @IsIn(['in_stock', 'sold', 'damaged', 'returned', 'reserved', 'in_transit'])
  status?:
    | 'in_stock'
    | 'sold'
    | 'damaged'
    | 'returned'
    | 'reserved'
    | 'in_transit';

  @IsOptional()
  @IsIn(['new', 'refurbished', 'used', 'damaged'])
  condition?: 'new' | 'refurbished' | 'used' | 'damaged';

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  saleId?: string;

  @IsOptional()
  @IsDateString()
  warrantyExpiryDate?: string;

  @IsOptional()
  @IsString()
  warrantyId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
