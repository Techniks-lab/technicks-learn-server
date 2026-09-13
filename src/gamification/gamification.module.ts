import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { GamificationController } from './gamification.controller.js';
import { GamificationService } from './gamification.service.js';
import { XpService } from './xp.service.js';

@Module({
  controllers: [GamificationController],
  providers: [GamificationService, XpService, PrismaService],
  exports: [GamificationService, XpService],
})
export class GamificationModule {}