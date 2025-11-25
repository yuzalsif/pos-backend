import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  IsDateString,
} from 'class-validator';

export class CreateInventoryItemDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsString()
  @IsNotEmpty()
  serialNumber: string;

  @IsOptional()
  @IsString()
  batchId?: string;

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
  purchaseId?: string;

  @IsOptional()
  @IsString()
  supplierId?: string;

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
