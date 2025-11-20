import { Provider } from '@nestjs/common';
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
            throw new Error('COUCHDB_URL and COUCHDB_DATABASE must be defined in environment variables.');
        }

        const connection = nano(couchdbUrl);

        try {
            const dbList = await connection.db.list();
            if (!dbList.includes(dbName)) {
                console.log(`Database '${dbName}' not found. Creating it...`);
                await connection.db.create(dbName, { partitioned: true });
                console.log(`Database '${dbName}' created successfully.`);
            }
        } catch (error) {
            console.error('Failed to connect to or create CouchDB database.', error);
            throw error;
        }

        return connection.db.use(dbName);
    },
    inject: [ConfigService],
};