import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
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
import { CoursesService } from './courses.service.js';
import { CreateCourseDto } from './dto/create-course.dto.js';
import { UpdateCourseDto } from './dto/update-course.dto.js';
import { CourseCheckInDto } from './dto/course-check-in.dto.js';
import { CreateCourseCategoryDto } from './dto/create-course-category.dto.js';

@ApiTags('Courses')
@Controller('courses')
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Get()
  @Version('1')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Browse published courses with enrollment state' })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'category', required: false, type: String })
  async findAll(
    @Req() req?: any,
    @Query('search') search?: string,
    @Query('category') category?: string,
  ) {
    return this.coursesService.findAll(req?.user?.id, { search, category });
  }

  @Get('categories')
  @Version('1')
  @ApiOperation({ summary: 'List all course categories (public)' })
  async listCategories() {
    return this.coursesService.listCategories();
  }

  @Post('categories')
  @Version('1')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.INSTRUCTOR)
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a course category (admin or instructor)' })
  async createCategory(@Body() dto: CreateCourseCategoryDto) {
    return this.coursesService.createCategory(dto);
  }

  @Delete('categories/:id')
  @Version('1')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.INSTRUCTOR)
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @ApiQuery({
    name: 'force',
    required: false,
    type: Boolean,
    description: 'Detach from all courses before deleting',
  })
  @ApiOperation({ summary: 'Delete a course category (admin or instructor)' })
  async deleteCategory(
    @Param('id') id: string,
    @Query('force') force?: string,
  ) {
    return this.coursesService.deleteCategory(id, force === 'true');
  }

  @Get('mine')
  @Version('1')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Courses you are enrolled in with streaks' })
  async findMine(@Req() req: any) {
    return this.coursesService.findMine(req.user.id);
  }

  @Get(':slug')
  @Version('1')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Course detail with published lessons' })
  async findBySlug(@Param('slug') slug: string, @Req() req?: any) {
    return this.coursesService.findBySlug(slug, req?.user?.id);
  }

  @Post(':slug/enroll')
  @Version('1')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enroll in a course (idempotent)' })
  async enroll(@Param('slug') slug: string, @Req() req: any) {
    return this.coursesService.enroll(slug, req.user.id);
  }

  @Post(':slug/check-in')
  @Version('1')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Daily course check-in — starts streak, awards XP' })
  async checkIn(
    @Param('slug') slug: string,
    @Req() req: any,
    @Body() dto: CourseCheckInDto,
  ) {
    return this.coursesService.checkIn(slug, req.user.id, dto.date);
  }

  @Post(':slug/unenroll')
  @Version('1')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unenroll from a course (deletes enrollment + check-ins)' })
  async unenroll(@Param('slug') slug: string, @Req() req: any) {
    return this.coursesService.unenroll(slug, req.user.id);
  }

  // ---------------------------------------------------------------------------
  // Admin CRUD
  // ---------------------------------------------------------------------------

  @Post()
  @Version('1')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.INSTRUCTOR)
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a course (admin or instructor)' })
  async create(@Body() dto: CreateCourseDto) {
    return this.coursesService.create(dto);
  }

  @Patch(':id')
  @Version('1')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.INSTRUCTOR)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update a course (admin or instructor)' })
  async update(@Param('id') id: string, @Body() dto: UpdateCourseDto) {
    return this.coursesService.update(id, dto);
  }

  @Delete(':id')
  @Version('1')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.INSTRUCTOR)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Delete a course (admin or instructor)' })
  async remove(@Param('id') id: string) {
    return this.coursesService.remove(id);
  }
}
