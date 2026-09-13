import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { LearnController } from './learn.controller.js';
import { LearnService } from './learn.service.js';
import { XpService } from '../gamification/xp.service.js';

@Module({
  controllers: [LearnController],
  providers: [LearnService, XpService, PrismaService],
  exports: [LearnService],
})
export class LearnModule {}