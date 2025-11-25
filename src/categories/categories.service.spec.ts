import {
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { CategoriesService } from './categories.service';

describe('CategoriesService (unit)', () => {
  let categoriesService: CategoriesService;
  const mockDb: any = {
    partitionedFind: jest.fn(),
    get: jest.fn(),
    insert: jest.fn(),
    destroy: jest.fn(),
  };
  const mockLogs: any = { record: jest.fn() };

  beforeEach(() => {
    mockDb.partitionedFind.mockReset();
    mockDb.get.mockReset();
    mockDb.insert.mockReset();
    mockDb.destroy.mockReset();
    mockLogs.record.mockReset();
    categoriesService = new CategoriesService(mockDb as any, mockLogs as any);
  });

  it('should create income category', async () => {
    mockDb.partitionedFind.mockResolvedValue({ docs: [] });
    mockDb.insert.mockResolvedValue({ id: 'tenant1:category:abc', rev: '1-0' });
    const dto = { name: 'Sales', type: 'income' as const };
    const res = await categoriesService.create('tenant1', 'user:1', dto);
    expect(mockDb.insert).toHaveBeenCalled();
    expect(res.name).toBe('Sales');
    expect(res.type).toBe('income');
    expect(res.createdAt).toBeDefined();
    expect(mockLogs.record).toHaveBeenCalledWith(
      'tenant1',
      { userId: 'user:1' },
      'category.create',
      'category',
      expect.any(String),
      { name: 'Sales', type: 'income' },
    );
  });

  it('should create expense category', async () => {
    mockDb.partitionedFind.mockResolvedValue({ docs: [] });
    mockDb.insert.mockResolvedValue({ id: 'tenant1:category:def', rev: '1-0' });
    const dto = {
      name: 'Rent',
      type: 'expense' as const,
      description: 'Monthly rent payments',
    };
    const res = await categoriesService.create('tenant1', 'user:1', dto);
    expect(res.name).toBe('Rent');
    expect(res.type).toBe('expense');
    expect(res.description).toBe('Monthly rent payments');
  });

  it('should not create duplicate category', async () => {
    mockDb.partitionedFind.mockResolvedValue({
      docs: [{ _id: 'tenant1:category:xyz', name: 'Sales', type: 'income' }],
    });
    const dto = { name: 'Sales', type: 'income' as const };
    await expect(
      categoriesService.create('tenant1', 'user:1', dto),
    ).rejects.toThrow(ConflictException);
    await expect(
      categoriesService.create('tenant1', 'user:1', dto),
    ).rejects.toThrow('category.create.duplicate');
  });

  it('should create subcategory under parent', async () => {
    const parent = {
      _id: 'tenant1:category:parent',
      name: 'Income',
      type: 'income',
    };
    mockDb.partitionedFind.mockResolvedValue({ docs: [] });
    mockDb.get.mockResolvedValue(parent);
    mockDb.insert.mockResolvedValue({
      id: 'tenant1:category:child',
      rev: '1-0',
    });
    const dto = {
      name: 'Consulting',
      type: 'income' as const,
      parentCategoryId: 'parent',
    };
    const res = await categoriesService.create('tenant1', 'user:1', dto);
    expect(res.name).toBe('Consulting');
    expect(res.parentCategoryId).toBe('tenant1:category:parent');
  });

  it('should not create subcategory with different type than parent', async () => {
    const parent = {
      _id: 'tenant1:category:parent',
      name: 'Income',
      type: 'income',
    };
    mockDb.partitionedFind.mockResolvedValue({ docs: [] });
    mockDb.get.mockResolvedValue(parent);
    const dto = {
      name: 'Consulting',
      type: 'expense' as const,
      parentCategoryId: 'parent',
    };
    await expect(
      categoriesService.create('tenant1', 'user:1', dto),
    ).rejects.toThrow(BadRequestException);
    await expect(
      categoriesService.create('tenant1', 'user:1', dto),
    ).rejects.toThrow('category.create.parent_type_mismatch');
  });

  it('should get category by id', async () => {
    mockDb.get.mockResolvedValue({
      _id: 'tenant1:category:abc',
      name: 'Sales',
      type: 'income',
    });
    const res = await categoriesService.get('tenant1', 'abc');
    expect(res.name).toBe('Sales');
  });

  it('should throw NotFoundException if category not found', async () => {
    mockDb.get.mockRejectedValue({ statusCode: 404 });
    await expect(categoriesService.get('tenant1', 'missing')).rejects.toThrow(
      NotFoundException,
    );
    await expect(categoriesService.get('tenant1', 'missing')).rejects.toThrow(
      'category.not_found',
    );
  });

  it('should list all categories', async () => {
    const docs = [
      { _id: 'tenant1:category:1', name: 'Sales', type: 'income' },
      { _id: 'tenant1:category:2', name: 'Rent', type: 'expense' },
    ];
    mockDb.partitionedFind.mockResolvedValue({ docs });
    const res = await categoriesService.list('tenant1');
    expect(res).toHaveLength(2);
  });

  it('should list categories by type', async () => {
    const docs = [
      { _id: 'tenant1:category:1', name: 'Sales', type: 'income' },
      { _id: 'tenant1:category:2', name: 'Consulting', type: 'income' },
    ];
    mockDb.partitionedFind.mockResolvedValue({ docs });
    const res = await categoriesService.list('tenant1', 'income');
    expect(res).toHaveLength(2);
    expect(res.every((c: any) => c.type === 'income')).toBe(true);
  });

  it('should update category', async () => {
    const category = {
      _id: 'tenant1:category:abc',
      name: 'Sales',
      type: 'income',
    };
    mockDb.get.mockResolvedValue(category);
    mockDb.partitionedFind.mockResolvedValue({ docs: [] });
    mockDb.insert.mockResolvedValue({ id: category._id, rev: '2-0' });
    const dto = { name: 'Product Sales', description: 'Sales from products' };
    const res = await categoriesService.update('tenant1', 'user:1', 'abc', dto);
    expect(mockDb.insert).toHaveBeenCalled();
    expect(res.name).toBe('Product Sales');
    expect(res.description).toBe('Sales from products');
    expect(res.updatedAt).toBeDefined();
  });

  it('should not update to duplicate name', async () => {
    const category = {
      _id: 'tenant1:category:abc',
      name: 'Sales',
      type: 'income',
    };
    const existing = {
      _id: 'tenant1:category:def',
      name: 'Consulting',
      type: 'income',
    };
    mockDb.get.mockResolvedValue(category);
    mockDb.partitionedFind.mockResolvedValue({ docs: [existing] });
    const dto = { name: 'Consulting' };
    await expect(
      categoriesService.update('tenant1', 'user:1', 'abc', dto),
    ).rejects.toThrow(ConflictException);
    await expect(
      categoriesService.update('tenant1', 'user:1', 'abc', dto),
    ).rejects.toThrow('category.update.duplicate');
  });

  it('should not delete category with subcategories', async () => {
    const category = {
      _id: 'tenant1:category:parent',
      name: 'Income',
      type: 'income',
      _rev: '1-0',
    };
    mockDb.get.mockResolvedValue(category);
    mockDb.partitionedFind.mockResolvedValue({
      docs: [{ _id: 'tenant1:category:child', parentCategoryId: category._id }],
    });
    await expect(
      categoriesService.delete('tenant1', 'user:1', 'parent'),
    ).rejects.toThrow(BadRequestException);
    await expect(
      categoriesService.delete('tenant1', 'user:1', 'parent'),
    ).rejects.toThrow('category.delete.has_subcategories');
  });
  it('should not delete category used in transactions', async () => {
    const category = {
      _id: 'tenant1:category:abc',
      name: 'Sales',
      type: 'income',
      _rev: '1-0',
    };
    mockDb.get.mockResolvedValue(category);
    mockDb.partitionedFind
      .mockResolvedValueOnce({ docs: [] }) // no subcategories
      .mockResolvedValueOnce({
        docs: [{ _id: 'tenant1:transaction:123', categoryId: category._id }],
      })
      .mockResolvedValueOnce({ docs: [] }) // no subcategories (2nd call)
      .mockResolvedValueOnce({
        docs: [{ _id: 'tenant1:transaction:123', categoryId: category._id }],
      });

    try {
      await categoriesService.delete('tenant1', 'user:1', 'abc');
      fail('Expected delete to throw BadRequestException');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.message).toBe('category.delete.has_transactions');
    }
  });
  it('should delete category when no dependencies', async () => {
    const category = {
      _id: 'tenant1:category:abc',
      name: 'Sales',
      type: 'income',
      _rev: '1-0',
    };
    mockDb.get.mockResolvedValue(category);
    mockDb.partitionedFind.mockResolvedValue({ docs: [] });
    mockDb.destroy.mockResolvedValue({ ok: true });
    const res = await categoriesService.delete('tenant1', 'user:1', 'abc');
    expect(mockDb.destroy).toHaveBeenCalledWith(category._id, category._rev);
    expect(res.deleted).toBe(true);
    expect(mockLogs.record).toHaveBeenCalledWith(
      'tenant1',
      { userId: 'user:1' },
      'category.delete',
      'category',
      category._id,
      { name: 'Sales' },
    );
  });

  it('should get subcategories', async () => {
    const parent = {
      _id: 'tenant1:category:parent',
      name: 'Income',
      type: 'income',
    };
    const subcategories = [
      {
        _id: 'tenant1:category:child1',
        parentCategoryId: parent._id,
        name: 'Sales',
      },
      {
        _id: 'tenant1:category:child2',
        parentCategoryId: parent._id,
        name: 'Consulting',
      },
    ];
    mockDb.get.mockResolvedValue(parent);
    mockDb.partitionedFind.mockResolvedValue({ docs: subcategories });
    const res = await categoriesService.getSubcategories('tenant1', 'parent');
    expect(res).toHaveLength(2);
  });

  it('should build category tree', async () => {
    const categories = [
      {
        _id: 'tenant1:category:1',
        name: 'Income',
        type: 'income',
        parentCategoryId: null,
      },
      {
        _id: 'tenant1:category:2',
        name: 'Sales',
        type: 'income',
        parentCategoryId: 'tenant1:category:1',
      },
      {
        _id: 'tenant1:category:3',
        name: 'Consulting',
        type: 'income',
        parentCategoryId: 'tenant1:category:1',
      },
    ];
    mockDb.partitionedFind.mockResolvedValue({ docs: categories });
    const tree = await categoriesService.getCategoryTree('tenant1', 'income');
    expect(tree).toHaveLength(1); // 1 root
    expect(tree[0].name).toBe('Income');
    expect(tree[0].children).toHaveLength(2); // 2 subcategories
  });
});
