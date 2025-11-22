import { Provider, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nano from 'nano';
import { DATABASE_CONNECTION } from './database.constants';

export const databaseProvider: Provider = {
    provide: DATABASE_CONNECTION,
    // We use an async factory to ensure ConfigService is ready
    useFactory: async (configService: ConfigService): Promise<nano.DocumentScope<any>> => {
        const couchdbUrl = configService.get<string>('COUCHDB_URL');
        const dbName = configService.get<string>('COUCHDB_DATABASE');

        if (!couchdbUrl || !dbName) {
            // Fail fast with a clear message (avoid console.log)
            throw new Error('database.env_missing');
        }

        const logger = new Logger('DatabaseProvider');

        const connection = nano(couchdbUrl);

        try {
            const dbList = await connection.db.list();
            if (!dbList.includes(dbName)) {
                logger.log(`Database '${dbName}' not found. Creating it...`);
                await connection.db.create(dbName, { partitioned: true });
                logger.log(`Database '${dbName}' created successfully.`);
            }
        } catch (error) {
            logger.error('Failed to connect to or create CouchDB database.', error as any);
            throw new InternalServerErrorException('database.connect_failed');
        }

        return connection.db.use(dbName);
    },
    inject: [ConfigService],
};