# Transaction Management in NestJS with CouchDB

## The Problem

Unlike Spring Boot with SQL databases (which have ACID transactions), CouchDB is eventually consistent and doesn't support multi-document transactions. This creates challenges:

1. **Batch Creation → Stock Adjustment**: What if stock adjustment fails after batch is created?
2. **Stock Adjustment → Log Recording**: What if logging fails after stock is adjusted?
3. **Data Inconsistency**: Partial operations leave the system in an inconsistent state

## Solutions Comparison

### 1. ❌ Traditional Database Transactions (Not Available)
```java
// Spring Boot example (NOT POSSIBLE in CouchDB)
@Transactional
public Batch createBatch(BatchDTO dto) {
    Batch batch = batchRepository.save(batch);
    stockService.adjustStock(batch);
    return batch; // Auto-rollback if any operation fails
}
```

### 2. ✅ Saga Pattern with Compensation (Our Implementation)
Execute operations sequentially and rollback on failure.

```typescript
// Step 1: Create batch
const batch = await db.insert(newBatch);

try {
  // Step 2: Adjust stock (critical)
  await stockService.adjustStock(...);
  stockAdjusted = true;
  
  // Step 3: Log (non-critical)
  await logsService.record(...);
  
} catch (error) {
  if (!stockAdjusted) {
    // COMPENSATION: Delete batch
    await db.destroy(batch._id, batch._rev);
    throw new Error('Stock adjustment failed, batch rolled back');
  }
}
```

**Pros:**
- Simple to implement
- Works with any database
- Clear error handling

**Cons:**
- Not truly atomic (small window of inconsistency)
- Compensation logic can fail
- Manual rollback code

### 3. ✅ CouchDB Bulk Operations
For multiple documents, use atomic bulk operations.

```typescript
// All-or-nothing for multiple docs
const docs = [
  { _id: 'batch:1', type: 'batch', ... },
  { _id: 'stock:1', type: 'stock', ... }
];

await db.bulk({ docs }); // Atomic at batch level
```

**Pros:**
- Atomic for bulk operations
- Native CouchDB feature
- Good performance

**Cons:**
- Limited to document operations
- Can't include service calls
- All docs must be prepared upfront

### 4. ✅ Event Sourcing
Store events instead of state, allowing replay and compensation.

```typescript
// Store events
await eventStore.append('batch-created', { batchId, quantity });
await eventStore.append('stock-adjusted', { productId, quantity });

// Rebuild state from events
const currentState = eventStore.replay();

// Compensate by adding reverse event
await eventStore.append('stock-adjustment-reversed', { ... });
```

**Pros:**
- Full audit trail
- Can replay/rebuild state
- Natural compensation

**Cons:**
- Complex implementation
- Higher storage needs
- Eventual consistency

### 5. ✅ Two-Phase Commit (2PC)
Prepare → Commit pattern with status tracking.

```typescript
// Phase 1: Prepare
const batch = await db.insert({ ...newBatch, status: 'pending' });
const stockOp = await stockService.prepare({ ...stockData });

// Phase 2: Commit or Rollback
if (stockOp.success) {
  await db.update({ ...batch, status: 'committed' });
  await stockService.commit(stockOp.id);
} else {
  await db.destroy(batch._id, batch._rev);
  await stockService.rollback(stockOp.id);
}
```

**Pros:**
- Industry standard
- More reliable than saga
- Coordinated commits

**Cons:**
- Complex to implement
- Requires coordinator
- Can have blocking

## Our Implementation: Saga Pattern

### BatchesService - Critical Operations with Rollback

```typescript
async create(tenantId, userId, userName, createDto) {
  let response;
  let result;
  let stockAdjusted = false;

  try {
    // Step 1: Create batch
    response = await this.db.insert(newBatch);
    result = { ...newBatch, _rev: response.rev };

    // Step 2: Adjust stock (CRITICAL - must succeed)
    await this.stockService.adjustStock(...);
    stockAdjusted = true;

    // Step 3: Log (non-critical, best effort)
    try {
      await this.logsService.record(...);
    } catch (logError) {
      this.logger.warn('Failed to record log', logError);
      // Continue - logging is not critical
    }

    return result;

  } catch (error) {
    // COMPENSATION: Rollback if critical step fails
    if (response && !stockAdjusted) {
      this.logger.error('Rolling back batch due to stock adjustment failure');
      
      try {
        await this.db.destroy(result._id, result._rev);
        this.logger.log('Successfully rolled back batch');
      } catch (rollbackError) {
        this.logger.error('CRITICAL: Rollback failed. Manual intervention required.');
      }

      throw new InternalServerErrorException({
        key: 'batch.creation_failed',
        vars: { reason: 'Stock adjustment failed and batch was rolled back' }
      });
    }

    throw error;
  }
}
```

### StockService - Defensive Programming

```typescript
async adjustStock(tenantId, userId, userName, dto) {
  let stockDoc;
  let previousState;

  try {
    // Get current stock
    stockDoc = await this.getStock(tenantId, dto.productId);
    previousState = { ...stockDoc }; // Snapshot for rollback

    // Calculate new values
    const newQuantity = stockDoc.quantityOnHand + dto.quantity;
    const newValue = this.calculateWeightedAverage(...);

    // Update stock
    stockDoc.quantityOnHand = newQuantity;
    stockDoc.totalValue = newValue;
    
    const response = await this.db.insert(stockDoc);

    // Log AFTER successful stock update
    try {
      await this.logsService.record(...);
    } catch (logError) {
      this.logger.warn('Failed to log stock adjustment', logError);
      // Stock is already updated, log failure is non-critical
    }

    return { ...stockDoc, _rev: response.rev };

  } catch (error) {
    this.logger.error('Stock adjustment failed', error);
    throw new InternalServerErrorException({
      key: 'stock.adjust_failed',
      vars: { productId: dto.productId }
    });
  }
}
```

## Operation Classification

### Critical Operations (Must Succeed Together)
- Batch creation → Stock adjustment
- Sale → Stock deduction
- Payment → Account balance update

**Strategy:** Use Saga with compensation

### Non-Critical Operations (Best Effort)
- Logging
- Notifications
- Analytics updates

**Strategy:** Try-catch with warning logs

### Independent Operations (Can Fail Independently)
- Email sending
- Cache updates
- Search index updates

**Strategy:** Async jobs / queues

## Best Practices

### 1. **Order Operations by Criticality**
```typescript
// Good: Critical first, non-critical last
await createBatch();          // Critical
await adjustStock();          // Critical
await sendNotification();     // Non-critical
```

### 2. **Always Snapshot Before Updates**
```typescript
const previousState = { ...currentDoc };
try {
  await update(currentDoc);
} catch (error) {
  // Can reference previousState for manual recovery
}
```

### 3. **Use Status Fields for Consistency**
```typescript
const batch = {
  status: 'pending',  // pending → committed → failed
  _id: '...',
  ...
};
```

### 4. **Implement Idempotency**
```typescript
// Allow retry without side effects
if (operation.alreadyProcessed) {
  return operation.previousResult;
}
```

### 5. **Log Compensation Failures**
```typescript
catch (rollbackError) {
  // Alert for manual intervention
  logger.error('CRITICAL: Manual intervention required', {
    batchId: batch._id,
    operation: 'rollback',
    error: rollbackError
  });
  
  // Could send to dead letter queue
  await deadLetterQueue.add({ batch, error: rollbackError });
}
```

### 6. **Monitor Partial Failures**
```typescript
// Regular job to find inconsistencies
async findOrphanedBatches() {
  const batches = await db.find({ type: 'batch' });
  const batchesWithoutStock = [];
  
  for (const batch of batches) {
    const stock = await stockService.getStock(batch.productId);
    if (!stock || stock.quantityOnHand < batch.quantityReceived) {
      batchesWithoutStock.push(batch);
    }
  }
  
  return batchesWithoutStock;
}
```

## When to Use Each Strategy

| Scenario | Strategy | Reason |
|----------|----------|--------|
| Batch + Stock | Saga with Compensation | Critical consistency needed |
| Multiple related docs | CouchDB Bulk Operations | Atomic at database level |
| Complex workflows | Event Sourcing | Need audit trail & replay |
| Distributed services | Two-Phase Commit | Coordination needed |
| Non-critical ops | Best Effort (try-catch) | Failure acceptable |

## Future Enhancements

### 1. **Transaction Manager Service**
```typescript
@Injectable()
class TransactionManager {
  async executeTransaction(operations: Operation[]) {
    const completed = [];
    
    try {
      for (const op of operations) {
        await op.execute();
        completed.push(op);
      }
    } catch (error) {
      // Compensate in reverse order
      for (const op of completed.reverse()) {
        await op.compensate();
      }
      throw error;
    }
  }
}
```

### 2. **Dead Letter Queue for Failed Compensations**
```typescript
@Injectable()
class DeadLetterQueue {
  async add(failedCompensation: any) {
    await this.db.insert({
      type: 'failed_compensation',
      timestamp: new Date(),
      ...failedCompensation
    });
    
    // Alert operations team
    await this.alertService.sendAlert('Manual intervention required');
  }
}
```

### 3. **Consistency Checker Job**
```typescript
@Cron('0 2 * * *') // Daily at 2 AM
async checkConsistency() {
  const issues = await this.findInconsistencies();
  
  if (issues.length > 0) {
    await this.reportService.generate(issues);
    await this.alertService.notify(issues);
  }
}
```

## Summary

While NestJS with CouchDB doesn't have traditional transactions like Spring Boot:

1. ✅ **Use Saga Pattern** for critical multi-step operations
2. ✅ **Implement compensation logic** for rollbacks
3. ✅ **Classify operations** by criticality (critical vs non-critical)
4. ✅ **Log all compensation failures** for manual intervention
5. ✅ **Monitor for inconsistencies** with regular checks
6. ✅ **Use bulk operations** when possible for atomicity

This approach provides **practical transaction-like behavior** suitable for production systems.
