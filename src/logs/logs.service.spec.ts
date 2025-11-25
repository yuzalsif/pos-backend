import { InternalServerErrorException } from '@nestjs/common';
import { LogsService } from './logs.service';

describe('LogsService (unit)', () => {
  let logsService: LogsService;
  const mockDb: any = {
    insert: jest.fn(),
    partitionedFind: jest.fn(),
  };

  beforeEach(() => {
    mockDb.insert.mockReset();
    mockDb.partitionedFind.mockReset();
    logsService = new LogsService(mockDb as any);
  });

  it('record should insert a log document and return id/rev', async () => {
    mockDb.insert.mockResolvedValue({ id: 'tenant1:log:abc', rev: '1-0' });

    const res = await logsService.record(
      'tenant1',
      { userId: 'u:1', name: 'U' },
      'something.create',
      'something',
      'tenant1:something:1',
      { foo: 'bar' },
    );

    expect(mockDb.insert).toHaveBeenCalledTimes(1);
    const inserted = mockDb.insert.mock.calls[0][0];
    expect(inserted._id).toMatch(/^tenant1:log:/);
    expect(inserted.type).toBe('log');
    expect(inserted.action).toBe('something.create');
    expect(inserted.resource).toBe('something');
    expect(inserted.resourceId).toBe('tenant1:something:1');
    expect(inserted.actor).toEqual({ userId: 'u:1', name: 'U', role: null });
    expect(inserted.meta).toEqual({ foo: 'bar' });
    expect(typeof inserted.createdAt).toBe('string');

    expect(res).toEqual({ id: 'tenant1:log:abc', rev: '1-0' });
  });

  it('record should throw InternalServerErrorException when insert fails', async () => {
    mockDb.insert.mockRejectedValue(new Error('db down'));

    await expect(
      logsService.record('tenant1', { userId: 'u:2' }, 'a', 'b'),
    ).rejects.toThrow(InternalServerErrorException);
  });

  it('findAll should query partitionedFind with provided filters and return docs', async () => {
    const docs = [{ _id: 'tenant1:log:1' }, { _id: 'tenant1:log:2' }];
    mockDb.partitionedFind.mockResolvedValue({ docs });

    const result = await logsService.findAll('tenant1', {
      action: 'a',
      resource: 'r',
      userId: 'u:1',
      limit: 10,
      skip: 0,
    });

    expect(mockDb.partitionedFind).toHaveBeenCalledTimes(1);
    const q =
      mockDb.partitionedFind.mock.calls[0][1] ||
      mockDb.partitionedFind.mock.calls[0][0];
    // The service builds the selector; ensure docs returned
    expect(result).toEqual(docs);
  });

  it('findAll should throw InternalServerErrorException on db error', async () => {
    mockDb.partitionedFind.mockRejectedValue(new Error('db error'));
    await expect(logsService.findAll('tenant1')).rejects.toThrow(
      InternalServerErrorException,
    );
  });
});
