import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
  Version,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorators.js';
import { UserRole } from '../auth/enums/user-role.enum.js';
import { BlogService } from './blog.service.js';
import { CreatePostDto } from './dto/create-post.dto.js';
import { UpdatePostDto } from './dto/update-post.dto.js';
import { CreateCommentDto } from './dto/create-comment.dto.js';

@ApiTags('Blog')
@Controller('blogs')
export class BlogController {
  constructor(private readonly blogService: BlogService) {}

  @Get()
  @Version('1')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Get published blog posts (public)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'category', required: false, type: String })
  @ApiQuery({ name: 'search', required: false, type: String })
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('category') category?: string,
    @Query('search') search?: string,
    @Req() req?: any,
  ) {
    return this.blogService.findAllPublished(
      parseInt(page || '1', 10),
      parseInt(limit || '20', 10),
      category,
      search,
      req?.user?.id,
    );
  }

  @Get('categories')
  @Version('1')
  @ApiOperation({ summary: 'Get all blog categories' })
  async getCategories() {
    return this.blogService.findAllCategories();
  }

  @Get('me')
  @Version('1')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'status',
    required: false,
    type: String,
    enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED', 'ALL'],
  })
  @ApiOperation({ summary: "Get the current user's blog posts (any status)" })
  async findMine(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return this.blogService.findMyPosts(
      req.user.id,
      parseInt(page || '1', 10),
      parseInt(limit || '20', 10),
      status,
    );
  }

  @Get('admin')
  @Version('1')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.INSTRUCTOR)
  @ApiBearerAuth('access-token')
  @ApiQuery({
    name: 'status',
    required: false,
    type: String,
    enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED', 'ALL'],
  })
  @ApiQuery({ name: 'authorId', required: false, type: String })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOperation({
    summary:
      'List all blog posts including drafts and other authors (admin or instructor)',
  })
  async findAllAdmin(
    @Query('status') status?: string,
    @Query('authorId') authorId?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.blogService.findAllAdmin({
      status,
      authorId,
      search,
      page: parseInt(page || '1', 10),
      limit: parseInt(limit || '20', 10),
    });
  }

  @Get('admin/:id')
  @Version('1')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.INSTRUCTOR)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get any blog post by id (admin or instructor)' })
  async findAdminById(@Param('id') id: string) {
    return this.blogService.findAdminById(id);
  }

  @Get(':slug')
  @Version('1')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Get a blog post by slug' })
  async findBySlug(@Param('slug') slug: string, @Req() req?: any) {
    return this.blogService.findBySlug(slug, req?.user?.id);
  }

  @Post()
  @Version('1')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.INSTRUCTOR)
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a blog post (admin or instructor)' })
  async create(@Req() req: any, @Body() dto: CreatePostDto) {
    return this.blogService.create(req.user.id, dto);
  }

  @Patch(':id')
  @Version('1')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update a blog post (author or admin)' })
  async update(
    @Param('id') id: string,
    @Req() req: any,
    @Body() dto: UpdatePostDto,
  ) {
    return this.blogService.update(id, req.user.id, dto, req.user.role);
  }

  @Delete(':id')
  @Version('1')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a blog post (author or admin)' })
  async remove(@Param('id') id: string, @Req() req: any) {
    return this.blogService.remove(id, req.user.id, req.user.role);
  }

  @Post(':id/like')
  @Version('1')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Toggle like on a blog post' })
  async toggleLike(@Param('id') id: string, @Req() req: any) {
    return this.blogService.toggleLike(id, req.user.id);
  }

  @Get(':id/comments')
  @Version('1')
  @ApiOperation({ summary: 'Get comments for a blog post' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getComments(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.blogService.getComments(
      id,
      parseInt(page || '1', 10),
      parseInt(limit || '50', 10),
    );
  }

  @Post(':id/comments')
  @Version('1')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a comment to a blog post' })
  async createComment(
    @Param('id') id: string,
    @Req() req: any,
    @Body() dto: CreateCommentDto,
  ) {
    return this.blogService.createComment(id, req.user.id, dto);
  }

  @Delete(':postId/comments/:commentId')
  @Version('1')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a comment (author or admin)' })
  async removeComment(
    @Param('postId') postId: string,
    @Param('commentId') commentId: string,
    @Req() req: any,
  ) {
    return this.blogService.removeComment(
      commentId,
      req.user.id,
      req.user.role,
    );
  }
}
