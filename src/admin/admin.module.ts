import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Module({
  controllers: [AdminController],
  providers: [PrismaService],
})
export class AdminModule {}