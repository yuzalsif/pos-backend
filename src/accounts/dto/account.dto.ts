export interface CreateAccountDto {
    name: string;
    initialBalance: number;
    type: string;
    currency: string;
}

export interface DepositDto {
    amount: number;
    categoryId: string;
}

export interface WithdrawDto {
    amount: number;
    categoryId: string;
}

export interface TransferDto {
    fromAccountId: string;
    toAccountId: string;
    amount: number;
    categoryId: string;
}
