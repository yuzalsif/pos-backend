import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { I18nService } from '../i18n/i18n.service';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
    constructor(private readonly i18n: I18nService) { }

    catch(exception: unknown, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();

        let status = HttpStatus.INTERNAL_SERVER_ERROR;
        let message: any = 'Internal server error';

        if (exception instanceof HttpException) {
            status = exception.getStatus();
            const res = exception.getResponse();

            if (typeof res === 'string') {
                message = res;
            } else if (typeof res === 'object' && res !== null) {
                // Support structured exception bodies: { key: 'translation.key', vars: {...} }
                // or legacy { message: 'some.string' }
                // @ts-ignore
                if ((res as any).key) {
                    // keep key in message variable so later we detect it as a translation key
                    // @ts-ignore
                    message = { key: (res as any).key, vars: (res as any).vars };
                } else {
                    // @ts-ignore
                    message = res.message || res.error || message;
                }
            }
        } else if (exception instanceof Error) {
            message = exception.message;
        }

        // Determine locale from Accept-Language header or default to 'en'
        const accept = request.headers['accept-language'] || 'en';
        const locale = (Array.isArray(accept) ? accept[0] : accept).split(',')[0].split('-')[0] || 'en';

        // Resolve translation. Support structured message { key, vars } or string keys.
        let translated: any = message;
        if (typeof message === 'object' && message !== null && (message as any).key) {
            translated = this.i18n.t((message as any).key, locale as string, (message as any).vars);
        } else if (typeof message === 'string' && !message.includes(' ')) {
            translated = this.i18n.t(message, locale as string);
        }

        response.status(status).json({
            success: false,
            error: {
                statusCode: status,
                message: translated,
            },
        });
    }
}
