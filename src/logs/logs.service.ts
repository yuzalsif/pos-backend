import { Injectable, Inject, Logger, InternalServerErrorException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import type nano from 'nano';
import { DATABASE_CONNECTION } from '../database/database.constants';

export interface LogActor {
    userId: string;
    name?: string;
    role?: string;
}

@Injectable()
export class LogsService {
    private readonly logger = new Logger(LogsService.name);

    constructor(@Inject(DATABASE_CONNECTION) private readonly db: nano.DocumentScope<any>) { }

    async record(tenantId: string, actor: LogActor, action: string, resource: string, resourceId?: string | null, meta?: any) {
        const now = new Date().toISOString();
        const doc = {
            _id: `${tenantId}:log:${uuidv4()}`,
            type: 'log',
            tenantId,
            action,
            resource,
            resourceId: resourceId ?? null,
            actor: {
                userId: actor.userId,
                name: actor.name ?? null,
                role: actor.role ?? null,
            },
            meta: meta ?? null,
            createdAt: now,
        };

        try {
            const res = await this.db.insert(doc);
            return { id: res.id, rev: res.rev };
        } catch (error) {
            this.logger.error('Failed to record log', error as any);
            throw new InternalServerErrorException({ key: 'log.create_failed' });
        }
    }

    async findAll(tenantId: string, opts: { action?: string; resource?: string; userId?: string; limit?: number; skip?: number } = {}) {
        try {
            const selector: any = { type: 'log' };
            if (opts.action) selector.action = opts.action;
            if (opts.resource) selector.resource = opts.resource;
            if (opts.userId) selector['actor.userId'] = opts.userId;

            const q: any = { selector };
            if (typeof opts.limit === 'number') q.limit = opts.limit;
            if (typeof opts.skip === 'number') q.skip = opts.skip;

            const result = await this.db.partitionedFind(tenantId, q);
            return result.docs;
        } catch (error) {
            this.logger.error('Failed to query logs', error as any);
            throw new InternalServerErrorException({ key: 'log.list_failed' });
        }
    }
}
