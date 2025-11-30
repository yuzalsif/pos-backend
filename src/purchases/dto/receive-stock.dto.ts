import {
    IsString,
    IsNumber,
    IsArray,
    ValidateNested,
    IsOptional,
    Min,
    IsNotEmpty,
    IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';

class ReceiveItemDto {
    @IsString()
    @IsNotEmpty()
    productId: string;

    @IsNumber()
    @Min(0)
    quantityReceiving: number;

    @IsString()
    @IsOptional()
    batchNumber?: string;

    @IsNumber()
    @Min(0)
    @IsOptional()
    unitCost?: number; // Override cost if different from PO

    @IsString()
    @IsOptional()
    notes?: string;
}

export class ReceiveStockDto {
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ReceiveItemDto)
    items: ReceiveItemDto[];

    @IsDateString()
    receivedDate: string;

    @IsString()
    @IsOptional()
    notes?: string;

    @IsString()
    @IsOptional()
    discrepancyNotes?: string;
}
