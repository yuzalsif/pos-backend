export enum Permission {
    // Sales permissions
    SALES_CREATE = 'sales.create',
    SALES_VIEW = 'sales.view',
    SALES_UPDATE = 'sales.update',
    SALES_DELETE = 'sales.delete',

    // Purchase permissions
    PURCHASES_CREATE = 'purchases.create',
    PURCHASES_VIEW = 'purchases.view',
    PURCHASES_UPDATE = 'purchases.update',
    PURCHASES_DELETE = 'purchases.delete',

    // Product permissions
    PRODUCTS_CREATE = 'products.create',
    PRODUCTS_VIEW = 'products.view',
    PRODUCTS_UPDATE = 'products.update',
    PRODUCTS_DELETE = 'products.delete',

    // Account permissions
    ACCOUNTS_CREATE = 'accounts.create',
    ACCOUNTS_VIEW = 'accounts.view',
    ACCOUNTS_DEPOSIT = 'accounts.deposit',
    ACCOUNTS_WITHDRAW = 'accounts.withdraw',
    ACCOUNTS_TRANSFER = 'accounts.transfer',

    // Category permissions
    CATEGORIES_CREATE = 'categories.create',
    CATEGORIES_VIEW = 'categories.view',
    CATEGORIES_UPDATE = 'categories.update',
    CATEGORIES_DELETE = 'categories.delete',

    // User management permissions
    USERS_CREATE = 'users.create',
    USERS_VIEW = 'users.view',
    USERS_UPDATE = 'users.update',
    USERS_DELETE = 'users.delete',

    // Supplier permissions
    SUPPLIERS_CREATE = 'suppliers.create',
    SUPPLIERS_VIEW = 'suppliers.view',
    SUPPLIERS_UPDATE = 'suppliers.update',
    SUPPLIERS_DELETE = 'suppliers.delete',

    // Reports permissions
    REPORTS_VIEW = 'reports.view',
    REPORTS_EXPORT = 'reports.export',
}

// Default permissions by role
export const DEFAULT_ROLE_PERMISSIONS: Record<string, Permission[]> = {
    owner: Object.values(Permission), // Owner has all permissions
    manager: [
        // Sales
        Permission.SALES_CREATE,
        Permission.SALES_VIEW,
        Permission.SALES_UPDATE,
        Permission.SALES_DELETE,
        // Purchases
        Permission.PURCHASES_CREATE,
        Permission.PURCHASES_VIEW,
        Permission.PURCHASES_UPDATE,
        Permission.PURCHASES_DELETE,
        // Products
        Permission.PRODUCTS_CREATE,
        Permission.PRODUCTS_VIEW,
        Permission.PRODUCTS_UPDATE,
        Permission.PRODUCTS_DELETE,
        // Accounts
        Permission.ACCOUNTS_CREATE,
        Permission.ACCOUNTS_VIEW,
        Permission.ACCOUNTS_DEPOSIT,
        Permission.ACCOUNTS_WITHDRAW,
        Permission.ACCOUNTS_TRANSFER,
        // Categories
        Permission.CATEGORIES_CREATE,
        Permission.CATEGORIES_VIEW,
        Permission.CATEGORIES_UPDATE,
        Permission.CATEGORIES_DELETE,
        // Suppliers
        Permission.SUPPLIERS_CREATE,
        Permission.SUPPLIERS_VIEW,
        Permission.SUPPLIERS_UPDATE,
        Permission.SUPPLIERS_DELETE,
        // Reports
        Permission.REPORTS_VIEW,
        Permission.REPORTS_EXPORT,
    ],
    attendant: [
        // Basic sales
        Permission.SALES_CREATE,
        Permission.SALES_VIEW,
        // Basic product view
        Permission.PRODUCTS_VIEW,
        // Basic account operations
        Permission.ACCOUNTS_VIEW,
        // Categories view
        Permission.CATEGORIES_VIEW,
    ],
};
