import {
    IsString,
    IsNumber,
    IsArray,
    ValidateNested,
    IsOptional,
    IsEnum,
    Min,
    IsNotEmpty,
    IsDateString,
    ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OpeningStockItemType } from '../inventory-items.types';

class OpeningStockItemDto {
    @IsString()
    @IsNotEmpty()
    productId: string;

    @IsNumber()
    @Min(0.01)
    quantity: number;

    @IsNumber()
    @Min(0)
    unitCost: number;

    @IsString()
    @IsOptional()
    location?: string;

    // For batched items
    @IsString()
    @IsOptional()
    batchNumber?: string;

    @IsDateString()
    @IsOptional()
    expiryDate?: string;

    @IsDateString()
    @IsOptional()
    manufactureDate?: string;

    // For serialized items
    @IsArray()
    @IsString({ each: true })
    @IsOptional()
    serialNumbers?: string[];

    @IsString()
    @IsOptional()
    notes?: string;
}

export class CreateOpeningStockDto {
    @IsDateString()
    entryDate: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => OpeningStockItemDto)
    @ArrayMinSize(1)
    items: OpeningStockItemDto[];

    @IsString()
    @IsOptional()
    notes?: string;
}

export class BulkImportOpeningStockDto {
    @IsDateString()
    entryDate: string;

    @IsString()
    @IsOptional()
    notes?: string;
}
