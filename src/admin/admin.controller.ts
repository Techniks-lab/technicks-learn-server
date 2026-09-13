import { Controller, Post, Version, HttpCode, HttpStatus, ForbiddenException, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service.js';

@ApiTags('admin')
@Controller('admin')
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Post('db/clear')
  @Version('1')
  @ApiOperation({ summary: 'Clear all data from the database (disabled in production)' })
  @ApiResponse({ status: 200, description: 'All data cleared' })
  @ApiResponse({ status: 403, description: 'Forbidden in production' })
  @HttpCode(HttpStatus.OK)
  async clearDatabase() {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Clearing the database is disabled in production');
    }
    
    await this.prisma.orm.public.RefreshToken.deleteAll();
    await this.prisma.orm.public.Session.deleteAll();
    await this.prisma.orm.public.PasswordReset.deleteAll();
    await this.prisma.orm.public.EmailVerification.deleteAll();
    await this.prisma.orm.public.User.deleteAll();

    this.logger.warn('Database cleared via admin endpoint');
    return { message: 'Database cleared successfully' };
  }
}