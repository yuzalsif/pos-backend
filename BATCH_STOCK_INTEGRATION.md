# Batch-Stock Integration

## Overview
Implemented automatic stock adjustment when batches are created to maintain accurate weighted average cost tracking across multiple batches.

## Implementation Details

### Automatic Stock Adjustment
When a batch is created, the system now automatically:
1. Creates the batch record in the database
2. Calls `StockService.adjustStock()` with the batch details
3. Updates stock levels and recalculates weighted average cost

### Code Changes

#### BatchesModule
- Added `StockModule` to imports to enable stock service injection

#### BatchesService
- Injected `StockService` into constructor
- Added automatic stock adjustment in `create()` method after batch insertion
- Wrapped stock adjustment in try-catch to prevent batch creation failure if stock adjustment fails
- Logs warning if stock adjustment fails but continues with batch creation

#### Stock Adjustment Call
```typescript
await this.stockService.adjustStock(tenantId, userId, userName, {
    productId: productId,
    quantity: createDto.quantity,
    type: 'in',
    purchaseCost: createDto.purchaseCost,
    reason: `Batch ${createDto.batchNumber} received`,
    referenceId: result._id.split(':').pop()!,
    referenceType: StockReferenceType.BATCH,
    location: createDto.location,
});
```

### Weighted Average Cost Calculation

The stock service automatically calculates weighted average cost when receiving inventory:

**Formula:**
```
averageCost = totalValue / quantityOnHand
totalValue = oldTotalValue + (quantity × purchaseCost)
```

**Example:**
- Batch 1: 50 units @ $10.00 = $500 → Stock: 50 units @ $10.00 avg
- Batch 2: 30 units @ $15.00 = $450 → Stock: 80 units @ $11.88 avg
- Batch 3: 20 units @ $12.00 = $240 → Stock: 100 units @ $11.90 avg

### Benefits

1. **Automatic Synchronization**: No need for frontend to make two API calls (create batch + adjust stock)
2. **Accurate Cost Tracking**: Each batch's purchase cost automatically contributes to weighted average
3. **Data Integrity**: Stock levels always reflect batch quantities
4. **Resilient**: Batch creation succeeds even if stock adjustment fails (logged as warning)
5. **Audit Trail**: Stock adjustments linked to batch via `referenceId` and `referenceType`

### Testing

#### Test Coverage
- ✅ Batch creation with successful stock adjustment
- ✅ Batch creation when stock adjustment fails (resilience)
- ✅ Stock adjustment called with correct parameters
- ✅ Weighted average cost calculation

#### Test Results
```
Test Suites: 16 passed
Tests:       132 passed
```

### API Usage

**Before (Manual):**
```bash
# Step 1: Create batch
POST /batches
{ "productId": "prod1", "quantity": 100, "purchaseCost": 1000 }

# Step 2: Adjust stock manually
POST /stock/adjust
{ "productId": "prod1", "quantity": 100, "type": "in", "purchaseCost": 1000 }
```

**After (Automatic):**
```bash
# Single call - stock is adjusted automatically
POST /batches
{ "productId": "prod1", "quantity": 100, "purchaseCost": 1000 }
```

## Future Enhancements

Consider similar automatic sync for:
- InventoryItem creation → Stock adjustment (for serial-tracked items)
- Batch consumption → Stock adjustment (for sales/manufacturing)
- Batch returns → Stock adjustment reversal

## Related Modules
- `src/batches/` - Batch tracking with FIFO logic
- `src/stock/` - Stock level and cost tracking
- `src/inventory-items/` - Serial number tracking

## Documentation Updated
- Added integration tests for automatic stock adjustment
- Documented weighted average cost calculation
- Added API usage examples
