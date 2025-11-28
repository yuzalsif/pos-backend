import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class MailService {
    private transporter: nodemailer.Transporter | null = null;
    private fromAddress: string;
    private logger = new Logger(MailService.name);

    constructor(private readonly config: ConfigService) {
        const host = this.config.get<string>('SMTP_HOST');
        const port = this.config.get<number>('SMTP_PORT');
        const user = this.config.get<string>('SMTP_USER');
        const pass = this.config.get<string>('SMTP_PASS');
        this.fromAddress =
            this.config.get<string>('MAIL_FROM') || 'no-reply@example.com';

        if (host && port && user && pass) {
            try {
                this.transporter = nodemailer.createTransport({
                    host,
                    port,
                    secure: Number(port) === 465, // true for 465, false for other ports
                    auth: { user, pass },
                });
                this.logger.log('SMTP transporter configured');
            } catch (err) {
                this.logger.error('Failed to configure SMTP transporter', err as any);
                this.transporter = null;
            }
        } else {
            this.logger.warn(
                'SMTP not fully configured. Emails will be logged to console.',
            );
        }
    }

    private renderTemplate(
        templateName: string,
        locale: string,
        vars: Record<string, string>,
    ) {
        const templatesDir = path.join(__dirname, 'templates');
        const htmlPath = path.join(templatesDir, `${templateName}.${locale}.html`);
        const txtPath = path.join(templatesDir, `${templateName}.${locale}.txt`);

        let html = '';
        let text = '';

        try {
            html = fs.readFileSync(htmlPath, 'utf8');
        } catch (err) {
            // fallback to english
            try {
                html = fs.readFileSync(
                    path.join(templatesDir, `${templateName}.en.html`),
                    'utf8',
                );
            } catch { }
        }

        try {
            text = fs.readFileSync(txtPath, 'utf8');
        } catch (err) {
            try {
                text = fs.readFileSync(
                    path.join(templatesDir, `${templateName}.en.txt`),
                    'utf8',
                );
            } catch { }
        }

        const render = (t: string) =>
            t.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');

        return { html: render(html), text: render(text) };
    }

    private loadLocale(locale: string) {
        const localesDir = path.join(__dirname, 'locales');
        const localePath = path.join(localesDir, `${locale}.json`);
        try {
            const raw = fs.readFileSync(localePath, 'utf8');
            return JSON.parse(raw);
        } catch (err) {
            if (locale !== 'en') return this.loadLocale('en');
            return { resetPassword: { subject: 'Reset your password' } };
        }
    }

    async sendResetPasswordEmail(
        email: string,
        tenantId: string,
        token: string,
        locale = 'en',
        name?: string,
    ) {
        const frontendUrl =
            this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000';
        const resetUrl = `${frontendUrl}/reset-password?tenantId=${encodeURIComponent(tenantId)}&token=${encodeURIComponent(token)}`;

        const translations = this.loadLocale(locale);
        const subject =
            translations?.resetPassword?.subject || 'Reset your password';

        const { html, text } = this.renderTemplate('reset-password', locale, {
            resetUrl,
            name: name || '',
            supportEmail:
                this.config.get<string>('SUPPORT_EMAIL') || this.fromAddress,
        });

        // If transporter is not configured, just log and return
        if (!this.transporter) {
            this.logger.log(
                `=== Email (logged) ===\nTo: ${email}\nSubject: ${subject}\nText:\n${text}\nHTML:\n${html}\n=== End Email ===`,
            );
            return Promise.resolve();
        }

        try {
            await this.transporter.sendMail({
                from: this.fromAddress,
                to: email,
                subject,
                text,
                html,
            });
            this.logger.log(`Sent reset password email to ${email}`);
        } catch (err) {
            this.logger.error('Failed to send email', err as any);
            // fallback to logging the email content
            this.logger.log(
                `Fallback email content -> To: ${email}, Subject: ${subject}, URL: ${resetUrl}`,
            );
        }
    }

    /**
     * Render purchase order template with variables
     */
    renderPurchaseOrderTemplate(locale: string, vars: Record<string, any>): { html: string; text: string } {
        const templatesDir = path.join(__dirname, 'templates');
        const htmlPath = path.join(templatesDir, `purchase-order.${locale}.html`);

        let html = '';

        try {
            html = fs.readFileSync(htmlPath, 'utf8');
        } catch (err) {
            // fallback to english
            try {
                html = fs.readFileSync(
                    path.join(templatesDir, 'purchase-order.en.html'),
                    'utf8',
                );
            } catch (fallbackErr) {
                this.logger.error('Could not load purchase order template', fallbackErr);
                html = '<p>Purchase Order {{poNumber}}</p>';
            }
        }

        // Replace simple {{variable}} placeholders
        let rendered = html.replace(/\{\{(\w+)\}\}/g, (_, key) => {
            const value = vars[key];
            return value !== undefined && value !== null ? String(value) : '';
        });

        // Handle {{#if variable}} conditionals
        rendered = rendered.replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, key, content) => {
            const value = vars[key];
            return value ? content : '';
        });

        // Generate plain text version by stripping HTML
        const text = rendered.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

        return { html: rendered, text };
    }

    /**
     * Send a generic email with optional attachments
     */
    async sendEmail(options: {
        to: string | string[];
        subject: string;
        text?: string;
        html?: string;
        attachments?: Array<{
            filename: string;
            content?: string | Buffer;
            path?: string;
            contentType?: string;
        }>;
    }): Promise<{ success: boolean; error?: string }> {
        // If transporter is not configured, just log
        if (!this.transporter) {
            this.logger.log(
                `=== Email (logged) ===\nTo: ${options.to}\nSubject: ${options.subject}\nText:\n${options.text || options.html}\n=== End Email ===`,
            );
            return { success: true };
        }

        try {
            await this.transporter.sendMail({
                from: this.fromAddress,
                to: options.to,
                subject: options.subject,
                text: options.text,
                html: options.html,
                attachments: options.attachments,
            });

            const recipient = Array.isArray(options.to)
                ? options.to.join(', ')
                : options.to;
            this.logger.log(`Sent email to ${recipient}: ${options.subject}`);
            return { success: true };
        } catch (err: any) {
            this.logger.error('Failed to send email', err);
            return { success: false, error: err.message || 'Unknown error' };
        }
    }
}
