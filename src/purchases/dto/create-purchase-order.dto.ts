import {
    IsString,
    IsEnum,
    IsArray,
    ValidateNested,
    IsNumber,
    IsOptional,
    Min,
    IsDateString,
    IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PurchaseOrderStatus } from '../purchases.types';

class PurchaseOrderItemDto {
    @IsString()
    @IsNotEmpty()
    productId: string;

    @IsNumber()
    @Min(1)
    quantityOrdered: number;

    @IsNumber()
    @Min(0)
    unitCost: number;

    @IsString()
    @IsOptional()
    notes?: string;
}

class PdfMetadataDto {
    @IsString()
    @IsOptional()
    template?: 'standard' | 'detailed' | 'minimal';

    @IsOptional()
    companyInfo?: {
        name: string;
        address: string;
        phone: string;
        email: string;
        taxId?: string;
    };

    @IsOptional()
    supplierInfo?: {
        name: string;
        address: string;
        contact: string;
        email: string;
    };

    @IsString()
    @IsOptional()
    termsAndConditions?: string;

    @IsString()
    @IsOptional()
    notes?: string;

    @IsOptional()
    signatures?: {
        preparedBy: string;
        preparedAt: string;
    };
}

export class CreatePurchaseOrderDto {
    @IsString()
    @IsNotEmpty()
    supplierId: string;

    @IsString()
    @IsNotEmpty()
    currency: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PurchaseOrderItemDto)
    items: PurchaseOrderItemDto[];

    @IsNumber()
    @Min(0)
    @IsOptional()
    taxAmount?: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    shippingCost?: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    discountAmount?: number;

    @IsDateString()
    @IsOptional()
    expectedDeliveryDate?: string;

    @IsOptional()
    @ValidateNested()
    @Type(() => PdfMetadataDto)
    pdfMetadata?: PdfMetadataDto;
}

export class UpdatePurchaseOrderDto {
    @IsString()
    @IsOptional()
    supplierId?: string;

    @IsString()
    @IsOptional()
    currency?: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PurchaseOrderItemDto)
    @IsOptional()
    items?: PurchaseOrderItemDto[];

    @IsNumber()
    @Min(0)
    @IsOptional()
    taxAmount?: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    shippingCost?: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    discountAmount?: number;

    @IsDateString()
    @IsOptional()
    expectedDeliveryDate?: string;

    @IsOptional()
    @ValidateNested()
    @Type(() => PdfMetadataDto)
    pdfMetadata?: PdfMetadataDto;
}

export class SendPurchaseOrderEmailDto {
    @IsString()
    @IsNotEmpty()
    recipientEmail: string;

    @IsString()
    @IsOptional()
    subject?: string;

    @IsString()
    @IsOptional()
    message?: string;

    @IsOptional()
    attachPdf?: boolean;
}

export class ChangePurchaseOrderStatusDto {
    @IsEnum(PurchaseOrderStatus)
    status: PurchaseOrderStatus;

    @IsString()
    @IsOptional()
    reason?: string;
}
