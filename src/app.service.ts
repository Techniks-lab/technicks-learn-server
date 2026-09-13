import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service.js';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(private readonly prisma: PrismaService) {}

  getAPIversion(): string {
    return 'V1';
  }

  async getHealth() {
    let database: 'up' | 'down' = 'up';

    try {
      await this.prisma.orm.public.User.where({}).first();
    } catch (error) {
      this.logger.error(`Health check: database ping failed: ${(error as Error).message}`);
      database = 'down';
    }

    const report = {
      status: database === 'up' ? 'ok' : 'degraded',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      database,
    };

    if (database === 'down') {
      throw new ServiceUnavailableException(report);
    }

    return report;
  }
}