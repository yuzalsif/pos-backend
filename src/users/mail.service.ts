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
      } catch {}
    }

    try {
      text = fs.readFileSync(txtPath, 'utf8');
    } catch (err) {
      try {
        text = fs.readFileSync(
          path.join(templatesDir, `${templateName}.en.txt`),
          'utf8',
        );
      } catch {}
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
}
