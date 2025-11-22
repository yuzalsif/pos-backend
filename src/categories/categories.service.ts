import { Injectable, ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

@Injectable()
export class CategoriesService {
    constructor(private readonly db: any, private readonly logs: any) { }

    async create(tenantId: string, actorId: string, dto: CreateCategoryDto) {
        const { name, type, parentCategoryId, description } = dto;

        // Check for duplicate category name
        const existing = await this.db.partitionedFind(tenantId, { selector: { name, type } });
        if (existing.docs.length > 0) throw new ConflictException('category.create.duplicate');

        // If parentCategoryId provided, verify parent exists and has same type
        if (parentCategoryId) {
            const parent = await this.get(tenantId, parentCategoryId);
            if (parent.type !== type) {
                throw new BadRequestException('category.create.parent_type_mismatch');
            }
        }

        const now = new Date().toISOString();
        const category = {
            _id: `${tenantId}:category:${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name,
            type,
            parentCategoryId: parentCategoryId ? `${tenantId}:category:${parentCategoryId}` : null,
            description,
            createdBy: actorId,
            updatedBy: actorId,
            createdAt: now,
            updatedAt: now,
        };

        await this.db.insert(category);
        await this.logs.record(tenantId, { userId: actorId }, 'category.create', 'category', category._id, { name, type });
        return category;
    }

    async get(tenantId: string, categoryId: string) {
        try {
            const id = categoryId.includes(':') ? categoryId : `${tenantId}:category:${categoryId}`;
            return await this.db.get(id);
        } catch (err) {
            if (err.statusCode === 404) throw new NotFoundException('category.not_found');
            throw err;
        }
    }

    async list(tenantId: string, type?: 'income' | 'expense') {
        const selector = type ? { type } : {};
        const res = await this.db.partitionedFind(tenantId, { selector });
        return res.docs.filter((doc: any) => doc._id.includes(':category:'));
    }

    async update(tenantId: string, actorId: string, categoryId: string, dto: UpdateCategoryDto) {
        const category = await this.get(tenantId, categoryId);

        if (dto.name) {
            // Check for duplicate name if changing name
            const existing = await this.db.partitionedFind(tenantId, {
                selector: { name: dto.name, type: category.type }
            });
            const duplicates = existing.docs.filter((doc: any) => doc._id !== category._id);
            if (duplicates.length > 0) throw new ConflictException('category.update.duplicate');

            category.name = dto.name;
        }

        if (dto.description !== undefined) {
            category.description = dto.description;
        }

        category.updatedBy = actorId;
        category.updatedAt = new Date().toISOString();

        await this.db.insert(category);
        await this.logs.record(tenantId, { userId: actorId }, 'category.update', 'category', category._id, dto);
        return category;
    }

    async delete(tenantId: string, actorId: string, categoryId: string) {
        const category = await this.get(tenantId, categoryId);

        // Check if category has subcategories
        const subcategories = await this.db.partitionedFind(tenantId, {
            selector: { parentCategoryId: category._id }
        });
        if (subcategories.docs.length > 0) {
            throw new BadRequestException('category.delete.has_subcategories');
        }

        // Check if category is used in any transactions
        const transactions = await this.db.partitionedFind(tenantId, {
            selector: { categoryId: category._id }
        });
        const usedTransactions = transactions.docs.filter((doc: any) => doc._id.includes(':transaction:'));
        if (usedTransactions.length > 0) {
            throw new BadRequestException('category.delete.has_transactions');
        }

        await this.db.destroy(category._id, category._rev);
        await this.logs.record(tenantId, { userId: actorId }, 'category.delete', 'category', category._id, { name: category.name });
        return { deleted: true, id: category._id };
    }

    async getSubcategories(tenantId: string, categoryId: string) {
        const category = await this.get(tenantId, categoryId);
        const res = await this.db.partitionedFind(tenantId, {
            selector: { parentCategoryId: category._id }
        });
        return res.docs;
    }

    async getCategoryTree(tenantId: string, type?: 'income' | 'expense') {
        const categories = await this.list(tenantId, type);
        const categoryMap = new Map();
        const roots: any[] = [];

        // First pass: create map of all categories
        categories.forEach((cat: any) => {
            categoryMap.set(cat._id, { ...cat, children: [] });
        });

        // Second pass: build tree structure
        categories.forEach((cat: any) => {
            if (cat.parentCategoryId) {
                const parent = categoryMap.get(cat.parentCategoryId);
                if (parent) {
                    parent.children.push(categoryMap.get(cat._id));
                }
            } else {
                roots.push(categoryMap.get(cat._id));
            }
        });

        return roots;
    }
}
