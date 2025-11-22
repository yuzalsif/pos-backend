import { Type } from 'class-transformer';
import {
    IsString,
    IsNotEmpty,
    IsNumber,
    IsBoolean,
    IsArray,
    ValidateNested,
    Min,
    ArrayMinSize,
    IsOptional,
} from 'class-validator';

// Price tiers are explicit per UoM for a product. Store values in the tenant's
// currency minor unit (e.g., cents) or agreed integer unit to avoid float issues.
class PriceTiersDto {
    @IsNumber()
    @Min(0)
    retail: number;

    @IsNumber()
    @Min(0)
    wholesale: number;

    @IsNumber()
    @Min(0)
    dealer: number;
}

class ProductUnitDto {
    // Reference to a master UoM document (tenant-scoped). Service should validate
    // that this uomId exists and belongs to the same tenant.
    @IsString()
    @IsNotEmpty()
    uomId: string;

    // Optional override or cached conversion factor to product base unit.
    @IsOptional()
    @IsNumber()
    @Min(0)
    factor?: number;

    @ValidateNested()
    @Type(() => PriceTiersDto)
    priceTiers: PriceTiersDto;
}

export class CreateProductDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsString()
    @IsNotEmpty()
    sku: string;

    @IsOptional()
    @IsString()
    category?: string;

    @IsBoolean()
    isActive: boolean;

    // Discount amount applied to the product base price (in minor units). Optional.
    @IsOptional()
    @IsNumber()
    @Min(0)
    discountAmount?: number;

    @IsOptional()
    @IsBoolean()
    purchase?: boolean; // if true, intention to register a purchase when creating product

    @IsOptional()
    @IsString()
    supplierId?: string; // optional supplier reference if registering a purchase

    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => ProductUnitDto)
    unitsOfMeasure: ProductUnitDto[];
}