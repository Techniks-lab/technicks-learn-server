import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { AdminModule } from './admin/admin.module.js';
import { BlogModule } from './blog/blog.module.js';
import { LearnModule } from './learn/learn.module.js';
import { CoursesModule } from './courses/courses.module.js';
import { GamificationModule } from './gamification/gamification.module.js';
import { PrismaService } from './prisma/prisma.service.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    AdminModule,
    BlogModule,
    LearnModule,
    CoursesModule,
    GamificationModule,
  ],
  controllers: [AppController],
  providers: [AppService, PrismaService],
})
export class AppModule {}
