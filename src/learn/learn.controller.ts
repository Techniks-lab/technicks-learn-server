import {
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Query,
  Req,
  UseGuards,
  Version,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorators.js';
import { UserRole } from '../auth/enums/user-role.enum.js';
import { LearnService } from './learn.service.js';
import { CreateLessonDto } from './dto/create-lesson.dto.js';
import { UpdateLessonDto } from './dto/update-lesson.dto.js';

@ApiTags('Learn')
@Controller('learn')
export class LearnController {
  constructor(private readonly learnService: LearnService) {}

  @Get('lessons')
  @Version('1')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Get published lessons' })
  async findAll(@Req() req?: any) {
    return this.learnService.findAll(req?.user?.id);
  }

  @Get('lessons/:slug')
  @Version('1')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Get a lesson by slug with its content blocks' })
  async findBySlug(@Param('slug') slug: string, @Req() req?: any) {
    return this.learnService.findBySlug(slug, req?.user?.id);
  }

  @Post('lessons/:slug/complete')
  @Version('1')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a lesson as completed and award XP' })
  async complete(@Param('slug') slug: string, @Req() req: any) {
    return this.learnService.complete(slug, req.user.id);
  }

  @Post('lessons')
  @Version('1')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.INSTRUCTOR)
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a lesson (admin or instructor)' })
  async create(@Body() dto: CreateLessonDto) {
    return this.learnService.create(dto);
  }

  @Patch('lessons/:id')
  @Version('1')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.INSTRUCTOR)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update a lesson (admin or instructor)' })
  async update(@Param('id') id: string, @Body() dto: UpdateLessonDto) {
    return this.learnService.update(id, dto);
  }

  @Delete('lessons/:id')
  @Version('1')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.INSTRUCTOR)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Delete a lesson (admin or instructor)' })
  async remove(@Param('id') id: string) {
    return this.learnService.remove(id);
  }
}
