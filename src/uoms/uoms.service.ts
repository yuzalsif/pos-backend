import { Injectable, Inject, ConflictException, InternalServerErrorException, Logger, BadRequestException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DATABASE_CONNECTION } from '../database/database.constants';
import type nano from 'nano';
import { CreateUomDto } from './dto/create-uom.dto';

@Injectable()
export class UomsService {
    private readonly logger = new Logger(UomsService.name);

    constructor(
        @Inject(DATABASE_CONNECTION) private readonly db: nano.DocumentScope<any>,
        // optional logs service will be injected by DI when available
        private readonly logsService?: any,
    ) { }

    async create(tenantId: string, userId: string, dto: CreateUomDto) {
        try {
            // ensure code uniqueness within tenant
            const existing = await this.db.partitionedFind(tenantId, {
                selector: { type: 'uom', code: dto.code },
            });

            if (existing.docs.length > 0) {
                throw new ConflictException({ key: 'uom.exists', vars: { code: dto.code } });
            }

            // Load all uoms for the tenant to decide behavior
            const all = await this.db.partitionedFind(tenantId, { selector: { type: 'uom' } });

            // If this is the first UoM, make it a base unit and force toBaseFactor=1
            if (all.docs.length === 0) {
                dto.baseUnit = true;
                dto.toBaseFactor = 1;
            }

            // If a base unit explicitly requested, force toBaseFactor to 1
            if (dto.baseUnit) {
                dto.toBaseFactor = 1;
            } else {
                // Non-base unit: require reference to a base UoM (baseUomId) and a positive toBaseFactor
                if (!dto.baseUomId) {
                    throw new BadRequestException({ key: 'uom.base_not_found' });
                }

                // Accept either full id (_id) or plain uuid; normalize to full id
                const baseId = dto.baseUomId.includes(':') ? dto.baseUomId : `${tenantId}:uom:${dto.baseUomId}`;

                let baseDoc: any;
                try {
                    baseDoc = await this.db.get(baseId);
                } catch (err) {
                    throw new BadRequestException({ key: 'uom.base_not_found', vars: { baseUomId: dto.baseUomId } });
                }

                if (!baseDoc || !baseDoc.baseUnit) {
                    throw new BadRequestException({ key: 'uom.base_not_found', vars: { baseUomId: dto.baseUomId } });
                }

                if (typeof dto.toBaseFactor !== 'number' || dto.toBaseFactor <= 0) {
                    throw new BadRequestException({ key: 'uom.invalid_factor' });
                }
            }

            const now = new Date().toISOString();

            const uomDoc = {
                _id: `${tenantId}:uom:${uuidv4()}`,
                type: 'uom',
                tenantId,
                code: dto.code,
                name: dto.name,
                toBaseFactor: typeof dto.toBaseFactor === 'number' ? dto.toBaseFactor : dto.baseUnit ? 1 : 1,
                description: dto.description ?? null,
                baseUnit: !!dto.baseUnit,
                baseUomId: dto.baseUomId ? (dto.baseUomId.includes(':') ? dto.baseUomId : `${tenantId}:uom:${dto.baseUomId}`) : null,
                createdAt: now,
                createdBy: { userId },
                updatedAt: now,
                updatedBy: { userId },
            };

            const res = await this.db.insert(uomDoc);
            const result = { id: res.id, rev: res.rev, ...uomDoc };

            // record audit log (best-effort, don't fail request on logging errors)
            try {
                if (this.logsService) {
                    await this.logsService.record(tenantId, { userId }, 'uom.create', 'uom', result.id, { code: dto.code });
                }
            } catch (e) {
                this.logger.warn('Failed to record uom.create log', e as any);
            }

            return result;
        } catch (error) {
            if (error instanceof ConflictException) throw error;
            this.logger.error('Failed to create UoM', error as any);
            throw new InternalServerErrorException({ key: 'uom.create_failed' });
        }
    }

    async findAll(tenantId: string) {
        try {
            const result = await this.db.partitionedFind(tenantId, { selector: { type: 'uom' } });
            return result.docs;
        } catch (error) {
            this.logger.error('Failed to list UoMs', error as any);
            throw new InternalServerErrorException({ key: 'uom.list_failed' });
        }
    }
}
