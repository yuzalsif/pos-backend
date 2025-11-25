import { IsString, IsNumber, IsNotEmpty, Min } from 'class-validator';

export class CreateAccountDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumber()
  @Min(0)
  initialBalance: number;

  @IsString()
  @IsNotEmpty()
  type: string;

  @IsString()
  @IsNotEmpty()
  currency: string;
}

export class DepositDto {
  @IsNumber()
  @Min(1)
  amount: number;

  @IsString()
  @IsNotEmpty()
  categoryId: string;
}

export class WithdrawDto {
  @IsNumber()
  @Min(1)
  amount: number;

  @IsString()
  @IsNotEmpty()
  categoryId: string;
}

export class TransferDto {
  @IsString()
  @IsNotEmpty()
  fromAccountId: string;

  @IsString()
  @IsNotEmpty()
  toAccountId: string;

  @IsNumber()
  @Min(1)
  amount: number;

  @IsString()
  @IsNotEmpty()
  categoryId: string;
}

export interface TransactionFilters {
  accountId?: string;
  categoryId?: string;
  type?: 'deposit' | 'withdraw' | 'transfer_in' | 'transfer_out';
  startDate?: string;
  endDate?: string;
}
