import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class I18nService {
    private readonly logger = new Logger(I18nService.name);
    private localesDir: string;

    constructor() {
        this.localesDir = path.join(__dirname, '..', 'users', 'locales');
    }

    private loadLocaleFile(locale: string): Record<string, any> | null {
        const file = path.join(this.localesDir, `${locale}.json`);
        try {
            const raw = fs.readFileSync(file, 'utf8');
            return JSON.parse(raw);
        } catch (err) {
            this.logger.debug(`Locale file not found for ${locale}, fallback to en`);
            if (locale !== 'en') return this.loadLocaleFile('en');
            return null;
        }
    }

    t(key: string, locale = 'en', vars?: Record<string, string>) {
        const data = this.loadLocaleFile(locale) || {};
        const parts = key.split('.');
        let cur: any = data;
        for (const p of parts) {
            if (!cur) break;
            cur = cur[p];
        }

        let str = cur || key;

        if (vars && typeof str === 'string') {
            str = str.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
        }

        return str;
    }
}
