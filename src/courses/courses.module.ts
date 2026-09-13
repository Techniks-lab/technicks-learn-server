import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CoursesController } from './courses.controller.js';
import { CoursesService } from './courses.service.js';
import { XpService } from '../gamification/xp.service.js';

@Module({
  controllers: [CoursesController],
  providers: [CoursesService, XpService, PrismaService],
  exports: [CoursesService],
})
export class CoursesModule {}
