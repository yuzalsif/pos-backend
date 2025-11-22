export interface CreateCategoryDto {
    name: string;
    type: 'income' | 'expense';
    parentCategoryId?: string;
    description?: string;
}

export interface UpdateCategoryDto {
    name?: string;
    description?: string;
}
