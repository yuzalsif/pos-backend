import { Type } from 'class-transformer';
import {
    IsString, IsNotEmpty, IsNumber, IsBoolean, IsArray,
    ValidateNested, Min, ArrayMinSize
} from 'class-validator';

class PriceTier {
    @IsString()
    @IsNotEmpty()
    name: 'retail' | 'wholesale' | 'dealer'; 
    @IsNumber()
    @Min(0)
    price: number;
}

class UnitOfMeasure {
    @IsString()
    @IsNotEmpty()
    name: string; 

    @IsNumber()
    @Min(1)
    // How many of the base unit this UoM contains. Base unit (e.g., "Piece") is 1.
    // A "Case" might have a factor of 12.
    factor: number;

    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => PriceTier)
    priceTiers: PriceTier[];
}

export class CreateProductDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsString()
    description?: string;

    @IsString()
    @IsNotEmpty()
    sku: string;

    @IsString()
    category: string;

    @IsBoolean()
    isActive: boolean;

    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => UnitOfMeasure)
    unitsOfMeasure: UnitOfMeasure[];
}