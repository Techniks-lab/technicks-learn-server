import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class BrevoService {
  private readonly logger = new Logger(BrevoService.name);
  private readonly apiKey: string;
  private readonly senderEmail: string;
  private readonly senderName: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('BREVO_API_KEY') || '';
    const rawSender = this.configService.get<string>('BREVO_SENDER_EMAIL') || '';
    const envelopeMatch = /^(?:([^<]+)\s*)?<([^>]+)>$/.exec(rawSender);
    if (envelopeMatch) {
      this.senderEmail = envelopeMatch[2].trim();
      this.senderName =
        envelopeMatch[1]?.trim() ||
        this.configService.get<string>('BREVO_SENDER_NAME', 'LearnHub');
    } else {
      this.senderEmail = rawSender;
      this.senderName = this.configService.get<string>('BREVO_SENDER_NAME', 'LearnHub');
    }
  }

  get isConfigured(): boolean {
    return Boolean(this.apiKey && this.senderEmail);
  }

  async sendVerificationOtpEmail(email: string, otp: string): Promise<void> {
    await this.sendOtpEmail(email, otp, {
      subject: 'Verify your Technicks Learn account',
      title: 'Verify Your Email',
      message: 'Thanks for signing up! Use the OTP below to verify your email address:',
    });
  }

  async sendOtpEmail(email: string, otp: string, options?: {
    subject?: string;
    title?: string;
    message?: string;
  }): Promise<void> {
    const {
      subject = 'Your Password Reset OTP',
      title = 'Password Reset Request',
      message = 'You requested to reset your password. Use the OTP below to complete the process:',
    } = options ?? {};

    const url = 'https://api.brevo.com/v3/smtp/email';

    if (!this.isConfigured) {
      this.logger.warn(
        `Brevo is not configured (missing BREVO_API_KEY / BREVO_SENDER_EMAIL) — skipping email to ${email}`,
      );
      return;
    }

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #333;">${title}</h2>
        <p>${message}</p>
        <div style="background: #f4f4f4; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #333;">${otp}</span>
        </div>
        <p style="color: #666;">This OTP expires in 15 minutes.</p>
        <p style="color: #666;">If you didn't request this, please ignore this email.</p>
      </div>
    `;

    try {
      await axios.post(
        url,
        {
          sender: { email: this.senderEmail, name: this.senderName },
          to: [{ email }],
          subject,
          htmlContent,
        },
        {
          headers: {
            'api-key': this.apiKey,
            'content-type': 'application/json',
          },
        },
      );
      this.logger.log(`OTP email sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send OTP email to ${email}`, error);
      throw error;
    }
  }
}