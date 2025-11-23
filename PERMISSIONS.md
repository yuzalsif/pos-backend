# Permission-Based Authorization System

## Overview

The system combines **Role-Based Access Control (RBAC)** with **Permission-Based Access Control** for fine-grained authorization.

- **Roles** provide baseline access (Owner, Manager, Attendant)
- **Permissions** provide granular control over specific actions

## Architecture

### 1. Permission Enum (`src/auth/permissions.enum.ts`)
Defines all available permissions in the system:
- Sales: `sales.create`, `sales.view`, `sales.update`, `sales.delete`
- Purchases: `purchases.create`, `purchases.view`, etc.
- Products, Accounts, Categories, Users, Suppliers, Reports

### 2. Default Role Permissions
```typescript
Owner → All permissions
Manager → Most permissions (except user management)
Attendant → Basic permissions (sales.create, sales.view, products.view)
```

### 3. Permission Guard (`src/auth/permissions.guard.ts`)
- Checks if user has required permissions
- Owner role bypasses all permission checks
- Other roles need explicit permissions

### 4. Permission Decorator (`src/auth/permissions.decorator.ts`)
```typescript
@RequirePermissions(Permission.SALES_CREATE, Permission.PRODUCTS_VIEW)
```

## Usage

### 1. Protect a Controller Route

```typescript
import { Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { Permission } from '../auth/permissions.enum';

@Controller('api/v1/sales')
@UseGuards(AuthGuard, PermissionsGuard) // Apply both guards
export class SalesController {
    
    @Post()
    @RequirePermissions(Permission.SALES_CREATE) // Require specific permission
    createSale(@Body() saleDto: CreateSaleDto, @Req() req: RequestWithUser) {
        // Only users with sales.create permission can access this
        return this.salesService.create(req.user.tenantId, saleDto);
    }
    
    @Get()
    @RequirePermissions(Permission.SALES_VIEW) // Different permission
    listSales(@Req() req: RequestWithUser) {
        return this.salesService.list(req.user.tenantId);
    }
}
```

### 2. Create a User with Custom Permissions

```typescript
// Create an attendant with sales and purchase permissions
POST /api/v1/users
{
    "email": "attendant@example.com",
    "password": "securepass123",
    "name": "John Doe",
    "role": "attendant",
    "permissions": [
        "sales.create",
        "sales.view",
        "purchases.create",
        "purchases.view",
        "products.view",
        "accounts.deposit",
        "accounts.withdraw"
    ]
}
```

### 3. User Login Response

When a user logs in, the JWT token includes their permissions:

```json
{
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "payload": {
        "userId": "uuid",
        "tenantId": "tenant-uuid",
        "name": "John Doe",
        "role": "attendant",
        "permissions": [
            "sales.create",
            "sales.view",
            "purchases.create"
        ]
    }
}
```

## Permission Matrix

| Permission | Owner | Manager | Attendant (Default) |
|------------|-------|---------|---------------------|
| `sales.create` | ✅ | ✅ | ✅ |
| `sales.view` | ✅ | ✅ | ✅ |
| `sales.update` | ✅ | ✅ | ❌ |
| `sales.delete` | ✅ | ✅ | ❌ |
| `purchases.create` | ✅ | ✅ | ❌ |
| `purchases.view` | ✅ | ✅ | ❌ |
| `products.create` | ✅ | ✅ | ❌ |
| `products.view` | ✅ | ✅ | ✅ |
| `accounts.create` | ✅ | ✅ | ❌ |
| `accounts.view` | ✅ | ✅ | ✅ |
| `accounts.deposit` | ✅ | ✅ | ❌ |
| `accounts.withdraw` | ✅ | ✅ | ❌ |
| `users.create` | ✅ | ❌ | ❌ |
| `reports.view` | ✅ | ✅ | ❌ |

## Use Cases

### Use Case 1: Sales-Only Attendant
Create an attendant who can only handle sales:
```json
{
    "role": "attendant",
    "permissions": ["sales.create", "sales.view", "products.view"]
}
```

### Use Case 2: Purchase-Only Attendant
Create an attendant who can only handle purchases:
```json
{
    "role": "attendant",
    "permissions": ["purchases.create", "purchases.view", "products.view", "suppliers.view"]
}
```

### Use Case 3: Cash Handler
Create an attendant who can handle cash operations:
```json
{
    "role": "attendant",
    "permissions": [
        "sales.create",
        "sales.view",
        "accounts.deposit",
        "accounts.withdraw",
        "accounts.view"
    ]
}
```

### Use Case 4: Full-Access Attendant
Create an attendant with most permissions except user management:
```json
{
    "role": "attendant",
    "permissions": [
        "sales.create", "sales.view", "sales.update",
        "purchases.create", "purchases.view",
        "products.view",
        "accounts.view", "accounts.deposit", "accounts.withdraw"
    ]
}
```

## Best Practices

1. **Principle of Least Privilege**: Only grant permissions that are absolutely necessary
2. **Use Roles First**: Start with role defaults, then customize permissions
3. **Owner Bypass**: Remember that owners always have full access
4. **Document Permissions**: Keep a record of which attendant has which permissions
5. **Regular Audits**: Review and update permissions regularly

## Implementation Notes

- Permissions are stored in the user document in the database
- Permissions are included in the JWT token (no additional DB lookup needed)
- Owner role bypasses all permission checks for maximum flexibility
- Multiple permissions can be required for a single route using the decorator
- Empty permissions array means the user only has default role permissions

## Migration Guide

To migrate existing users to the new permission system:

1. All existing users will have an empty permissions array
2. They will retain their role-based access
3. Add permissions field to user documents as needed:

```typescript
// Update user document
{
    "_id": "tenant:user:uuid",
    "role": "attendant",
    "permissions": ["sales.create", "sales.view"] // Add this
}
```
