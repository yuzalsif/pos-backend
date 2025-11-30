export enum OpeningStockItemType {
    REGULAR = 'regular', // No batch or serial tracking
    BATCHED = 'batched', // Batch tracking
    SERIALIZED = 'serialized', // Serial number tracking
}

export interface OpeningStockItem {
    productId: string;
    sku: string;
    productName: string;
    quantity: number;
    unitCost: number;
    totalCost: number;
    type: OpeningStockItemType;
    location: string;

    // For batched items
    batchNumber?: string;
    expiryDate?: string;
    manufactureDate?: string;

    // For serialized items
    serialNumbers?: string[];

    notes?: string;
}

export interface OpeningStockEntry {
    _id: string; // tenant:opening-stock:uuid
    type: 'opening_stock';
    tenantId: string;

    entryNumber: string; // OS-YYYYMMDD-XXX
    entryDate: string; // ISO date

    items: OpeningStockItem[];
    totalQuantity: number;
    totalCost: number;

    // Created batches/serials
    batchIds: string[];
    serialIds: string[];

    status: 'completed' | 'cancelled';
    notes?: string;

    // Audit
    _rev?: string;
    createdAt: string;
    createdBy: {
        userId: string;
        name: string;
    };
    updatedAt: string;
    updatedBy: {
        userId: string;
        name: string;
    };
}
