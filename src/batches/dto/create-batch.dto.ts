import { Type } from 'class-transformer';
import {
    IsString,
    IsNotEmpty,
    IsNumber,
    IsBoolean,
    IsOptional,
    Min,
    ValidateNested,
    IsDateString,
} from 'class-validator';

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

export class CreateBatchDto {
    @IsString()
    @IsNotEmpty()
    productId: string;

    @IsString()
    @IsNotEmpty()
    batchNumber: string;

    @IsOptional()
    @IsString()
    supplierBatchNumber?: string;

    @IsNumber()
    @Min(0)
    quantity: number;

    @IsNumber()
    @Min(0)
    purchaseCost: number;

    @IsOptional()
    @ValidateNested()
    @Type(() => PriceTiersDto)
    priceTiers?: PriceTiersDto;

    @IsOptional()
    @IsBoolean()
    priceOverride?: boolean;

    @IsOptional()
    @IsDateString()
    manufactureDate?: string;

    @IsOptional()
    @IsDateString()
    expiryDate?: string;

    @IsOptional()
    @IsString()
    supplierId?: string;

    @IsOptional()
    @IsString()
    purchaseId?: string;

    @IsOptional()
    @IsString()
    location?: string;
}
