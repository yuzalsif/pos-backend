import {
  Injectable,
  Inject,
  ConflictException,
  Logger,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import nano, { type DocumentScope } from 'nano';
import { DATABASE_CONNECTION } from '../database/database.constants';
import { CreateSupplierDto } from './dto/create-supplier.dto';

@Injectable()
export class SuppliersService {
  private readonly logger = new Logger(SuppliersService.name);
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: DocumentScope<any>,
    private readonly logsService?: any,
  ) {}

  async create(
    tenantId: string,
    createSupplierDto: CreateSupplierDto,
    createdBy?: string,
  ) {
    if (!tenantId) {
      throw new BadRequestException({ key: 'tenant.missing' });
    }
    const { name, phone, email, address } = createSupplierDto;

    const selector: any = { type: 'supplier' };
    selector.$or = [{ phone }, { email }];

    try {
      const res = await this.db.partitionedFind(tenantId, { selector });
      if (res.docs && res.docs.length > 0) {
        // duplicate found
        throw new ConflictException({ key: 'supplier.exists' });
      }
    } catch (err) {
      // If we threw a ConflictException above it will be caught here — rethrow it so callers see the correct error.
      if (err instanceof ConflictException) throw err;
      this.logger.error('Failed checking existing supplier', err as any);
      throw new InternalServerErrorException({ key: 'supplier.check_failed' });
    }

    const now = new Date().toISOString();
    const doc = {
      _id: `${tenantId}:supplier:${uuidv4()}`,
      type: 'supplier',
      tenantId,
      name,
      phone,
      email: email || null,
      address: address || null,
      createdBy: createdBy || null,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await this.db.insert(doc);
    } catch (err) {
      this.logger.error('Failed to create supplier', err as any);
      throw new InternalServerErrorException({ key: 'supplier.create_failed' });
    }

    // record supplier.create log (best-effort)
    try {
      if (this.logsService) {
        await this.logsService.record(
          tenantId,
          { userId: createdBy || 'system' },
          'supplier.create',
          'supplier',
          doc._id,
          { name, phone, email },
        );
      }
    } catch (e) {
      this.logger.warn('Failed to record supplier.create log', e as any);
    }

    const { _rev, ...result } = doc as any;
    return result;
  }

  async findAll(tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException({ key: 'tenant.missing' });
    }

    const query = { selector: { type: 'supplier' } };
    try {
      const result = await this.db.partitionedFind(tenantId, query);
      return result.docs || [];
    } catch (err) {
      this.logger.error('Failed to list suppliers', err as any);
      throw new InternalServerErrorException({ key: 'supplier.list_failed' });
    }
  }
}
