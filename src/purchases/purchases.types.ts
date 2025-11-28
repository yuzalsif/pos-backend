export enum PurchaseOrderStatus {
    DRAFT = 'draft', // Being created, not yet sent
    PENDING = 'pending', // Sent to supplier, awaiting delivery
    PARTIAL = 'partial', // Partially received
    COMPLETED = 'completed', // Fully received
    CANCELLED = 'cancelled', // Cancelled before completion
    OVERDELIVERED = 'overdelivered', // Should not happen with our rules
}

export interface PurchaseOrderItem {
    productId: string; // Full document ID: tenant:product:uuid
    sku: string;
    productName: string;
    quantityOrdered: number;
    quantityReceived: number;
    unitCost: number;
    lineTotal: number;
    notes?: string;
}

export interface EmailHistoryEntry {
    sentAt: string; // ISO date
    sentBy: {
        userId: string;
        name: string;
    };
    recipientEmail: string;
    ccEmails?: string[];
    status: 'sent' | 'failed';
    error?: string;
}

export interface PurchaseOrderPdfMetadata {
    template?: 'standard' | 'detailed' | 'minimal';
    companyInfo?: {
        name: string;
        address: string;
        phone: string;
        email: string;
        taxId?: string;
    };
    supplierInfo?: {
        name: string;
        address: string;
        contact: string;
        email: string;
    };
    termsAndConditions?: string;
    notes?: string;
    signatures?: {
        preparedBy: string;
        preparedAt: string;
        approvedBy?: string;
        approvedAt?: string;
    };
}

export interface PurchaseOrder {
    _id: string; // tenant:purchase:uuid
    type: 'purchase';
    tenantId: string;

    // PO identification
    poNumber: string; // PO-20250126-001
    status: PurchaseOrderStatus;

    // Supplier reference
    supplierId: string; // Full document ID
    supplierName: string; // Snapshot
    supplierEmail?: string; // Snapshot

    // Financial (single currency)
    currency: string; // RWF, USD, etc.
    subtotal: number;
    taxAmount: number;
    shippingCost: number;
    discountAmount: number;
    totalAmount: number;

    // Line items
    items: PurchaseOrderItem[];

    // Dates
    orderDate: string; // ISO date
    expectedDeliveryDate?: string; // ISO date
    actualDeliveryDate?: string; // ISO date

    // References
    receivingIds: string[]; // IDs of receiving records

    // PDF/Email metadata
    pdfMetadata?: PurchaseOrderPdfMetadata;
    emailHistory: EmailHistoryEntry[];
    companyInfo?: {
        name: string;
        address: string;
        phone: string;
        email: string;
        taxId?: string;
    };
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
