import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';
import { or } from '@prisma/orm-postgres/orm-client';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

@Injectable()
export class CategoryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Public — list every category with a live post count.
   */
  async findAll(includeArchived = false) {
    const categories = await this.prisma.orm.public.BlogCategory.include(
      'posts',
      (p) => p.count(),
    )
      .orderBy((c) => c.name.asc())
      .all();
    function toIso(value: Date | string | null | undefined): string | null {
      if (!value) return null;
      if (value instanceof Date) return value.toISOString();
      // Handle ISO strings or anything string-like
      const parsed = new Date(value);
      if (isNaN(parsed.getTime())) return null;
      return parsed.toISOString();
    }
    return categories.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      postCount: (c.posts as unknown as number) ?? 0,
      createdAt: toIso(c.createdAt),
    }));
  }

  /**
   * Public — fetch a single category by id or slug.
   */
  async findOne(identifier: string) {
    const category = await this.prisma.orm.public.BlogCategory.where((c) =>
      or(c.id.eq(identifier), c.slug.eq(identifier)),
    )
      .include('posts', (p) => p.count())
      .first();

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return {
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description,
      postCount: (category.posts as unknown as number) ?? 0,
      createdAt: category.createdAt.toISOString(),
    };
  }

  /**
   * Admin — create a category.
   * Slug auto-generated from name if not provided.
   * Idempotent: returns existing category if the slug already exists.
   */
  async create(dto: CreateCategoryDto) {
    const slug = dto.slug ?? slugify(dto.name);

    const existing = await this.prisma.orm.public.BlogCategory.where((c) =>
      or(c.slug.eq(slug), c.name.eq(dto.name)),
    ).first();

    function toIso(value: Date | string | null | undefined): string | null {
      if (!value) return null;
      if (value instanceof Date) return value.toISOString();
      // Handle ISO strings or anything string-like
      const parsed = new Date(value);
      if (isNaN(parsed.getTime())) return null;
      return parsed.toISOString();
    }

    if (existing) {
      return {
        id: existing.id,
        name: existing.name,
        slug: existing.slug,
        description: existing.description,
        createdAt: toIso(existing.createdAt),
      };
    }

    const category = await this.prisma.orm.public.BlogCategory.create({
      id: crypto.randomUUID(),
      name: dto.name,
      slug,
      description: dto.description ?? null,
      createdAt: new Date(),
    });

    return {
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description,
      createdAt: category.createdAt.toISOString(),
    };
  }

  /**
   * Admin — update a category's name, slug, or description.
   */
  async update(id: string, dto: UpdateCategoryDto) {
    const category = await this.prisma.orm.public.BlogCategory.where({
      id,
    }).first();

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    // If slug is being changed, make sure it's still unique.
    if (dto.slug && dto.slug !== category.slug) {
      const clash = await this.prisma.orm.public.BlogCategory.where({
        slug: dto.slug,
      }).first();
      if (clash) {
        throw new ConflictException(`Slug "${dto.slug}" is already taken`);
      }
    }

    // If name is being changed and no new slug provided, regenerate it.
    const nextSlug =
      dto.slug ??
      (dto.name && dto.name !== category.name ? slugify(dto.name) : undefined);

    const updateData: Record<string, unknown> = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (nextSlug !== undefined) updateData.slug = nextSlug;
    if (dto.description !== undefined) updateData.description = dto.description;

    const updated = await this.prisma.orm.public.BlogCategory.where({
      id,
    }).update(updateData);

    return {
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      description: updated.description,
      createdAt: updated.createdAt.toISOString(),
    };
  }

  /**
   * Admin — delete a category.
   * Refuses if posts are still attached (safer than cascade).
   * Pass force: true to detach from all posts first.
   */
  async remove(id: string, force = false) {
    const category = await this.prisma.orm.public.BlogCategory.where({ id })
      .include('posts', (p) => p.count())
      .first();

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const postCount = (category.posts as unknown as number) ?? 0;

    if (postCount > 0 && !force) {
      throw new ConflictException(
        `Category has ${postCount} post(s). Re-run with ?force=true to detach them.`,
      );
    }

    if (postCount > 0) {
      await this.prisma.orm.public.BlogPostCategory.where({
        categoryId: id,
      }).delete();
    }

    await this.prisma.orm.public.BlogCategory.where({ id }).delete();

    return { success: true, detachedPosts: postCount };
  }

  /**
   * Used by BlogService.create() and .update() to validate category ids
   * before attaching them to a post.
   */
  async assertAllExist(categoryIds: string[]): Promise<void> {
    if (categoryIds.length === 0) return;

    const found = await this.prisma.orm.public.BlogCategory.where((c) =>
      c.id.in(categoryIds),
    ).all();

    if (found.length !== categoryIds.length) {
      const foundIds = new Set(found.map((c) => c.id));
      const missing = categoryIds.filter((id) => !foundIds.has(id));
      throw new NotFoundException(
        `Categories not found: ${missing.join(', ')}`,
      );
    }
  }
}
