import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { BlogController } from './blog.controller.js';
import { BlogService } from './blog.service.js';
import { CategoryController } from './category.controller.js';
import { CategoryService } from './category.service.js';

@Module({
  controllers: [BlogController, CategoryController],
  providers: [BlogService, CategoryService, PrismaService],
  exports: [BlogService, CategoryService],
})
export class BlogModule {}