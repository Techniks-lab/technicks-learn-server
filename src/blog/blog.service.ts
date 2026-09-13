import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreatePostDto } from './dto/create-post.dto.js';
import { UpdatePostDto } from './dto/update-post.dto.js';
import { CreateCommentDto } from './dto/create-comment.dto.js';
import { CategoryService } from './category.service.js';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Bulk-fetch like and comment counts for a set of post IDs.
 * Uses two queries total (one per relation) instead of N+1 or
 * unsupported include-count syntax on Prisma 8.
 */
async function getCountsForPosts(
  prisma: PrismaService,
  postIds: string[],
): Promise<{
  likeCounts: Map<string, number>;
  commentCounts: Map<string, number>;
}> {
  const likeCounts = new Map<string, number>();
  const commentCounts = new Map<string, number>();

  if (postIds.length === 0) {
    return { likeCounts, commentCounts };
  }

  const [likes, comments] = await Promise.all([
    prisma.orm.public.BlogPostLike.where((l) => l.postId.in(postIds)).all(),
    prisma.orm.public.BlogComment.where((c) => c.postId.in(postIds)).all(),
  ]);

  for (const like of likes) {
    likeCounts.set(like.postId, (likeCounts.get(like.postId) ?? 0) + 1);
  }
  for (const comment of comments) {
    commentCounts.set(
      comment.postId,
      (commentCounts.get(comment.postId) ?? 0) + 1,
    );
  }

  return { likeCounts, commentCounts };
}

@Injectable()
export class BlogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categoryService: CategoryService,
  ) {}

  // ---------------------------------------------------------------------------
  // Feed
  // ---------------------------------------------------------------------------

  async findAllPublished(
    page = 1,
    limit = 20,
    categorySlug?: string,
    search?: string,
    userId?: string,
  ) {
    const offset = (page - 1) * limit;

    // Category filter: slug → category id → matching post ids via join table.
    const category = categorySlug
      ? await this.prisma.orm.public.BlogCategory.where((c) =>
          c.slug.eq(categorySlug),
        ).first()
      : null;

    const matchingPostIds = category
      ? new Set(
          (
            await this.prisma.orm.public.BlogPostCategory.where((j) =>
              j.categoryId.eq(category.id),
            ).all()
          ).map((r) => r.postId),
        )
      : null;

    let query = this.prisma.orm.public.BlogPost.where((p) =>
      p.status.eq('PUBLISHED' as any),
    );

    if (matchingPostIds) {
      query = query.where((p) => p.id.in([...matchingPostIds]));
    }

    if (search) {
      query = query.where((p) => p.title.ilike(`%${search}%`));
    }

    const posts = await query
      .include('author', (a) =>
        a.select('id', 'fullName', 'username', 'avatarUrl'),
      )
      .include('categories', (c) =>
        c.include('category', (cat) => cat.select('id', 'name', 'slug')),
      )
      .orderBy((p) => p.createdAt.desc())
      .limit(limit)
      .offset(offset)
      .all();

    const postIds = posts.map((p) => p.id);

    // Counts + liked state — all in parallel
    const [{ likeCounts, commentCounts }, likedPostIds] = await Promise.all([
      getCountsForPosts(this.prisma, postIds),
      this.getLikedPostIds(userId, postIds),
    ]);

    // Total matching count (respects search + category filters).
    // Prisma 8 RC doesn't support top-level .count() — re-run the same
    // filtered query without pagination/sorting to get the true total.
    let countQuery = this.prisma.orm.public.BlogPost.where((p) =>
      p.status.eq('PUBLISHED' as any),
    );

    if (matchingPostIds) {
      countQuery = countQuery.where((p) => p.id.in([...matchingPostIds]));
    }

    if (search) {
      countQuery = countQuery.where((p) => p.title.ilike(`%${search}%`));
    }

    const total = (await countQuery.all()).length;

    return {
      posts: posts.map((p) => ({
        id: p.id,
        title: p.title,
        slug: p.slug,
        excerpt: p.excerpt,
        coverImage: p.coverImage,
        createdAt: p.createdAt,
        author: {
          id: (p.author as any).id,
          name: (p.author as any).fullName,
          username: (p.author as any).username,
          avatarUrl: (p.author as any).avatarUrl,
        },
        categories: (p.categories as any[]).map((c: any) => ({
          id: c.category.id,
          name: c.category.name,
          slug: c.category.slug,
        })),
        likeCount: likeCounts.get(p.id) ?? 0,
        commentCount: commentCounts.get(p.id) ?? 0,
        isLiked: likedPostIds.has(p.id),
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ---------------------------------------------------------------------------
  // Single post
  // ---------------------------------------------------------------------------

  async findBySlug(slug: string, userId?: string) {
    const post = await this.prisma.orm.public.BlogPost.where({ slug })
      .include('author', (a) =>
        a.select('id', 'fullName', 'username', 'avatarUrl'),
      )
      .include('categories', (c) =>
        c.include('category', (cat) => cat.select('id', 'name', 'slug')),
      )
      .first();

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    const [{ likeCounts, commentCounts }, likedPostIds] = await Promise.all([
      getCountsForPosts(this.prisma, [post.id]),
      this.getLikedPostIds(userId, [post.id]),
    ]);

    return {
      id: post.id,
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      content: post.content,
      coverImage: post.coverImage,
      status: post.status,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      author: {
        id: (post.author as any).id,
        name: (post.author as any).fullName,
        username: (post.author as any).username,
        avatarUrl: (post.author as any).avatarUrl,
      },
      categories: (post.categories as any[]).map((c: any) => ({
        id: c.category.id,
        name: c.category.name,
        slug: c.category.slug,
      })),
      likeCount: likeCounts.get(post.id) ?? 0,
      commentCount: commentCounts.get(post.id) ?? 0,
      isLiked: likedPostIds.has(post.id),
    };
  }

  // ---------------------------------------------------------------------------
  // My posts
  // ---------------------------------------------------------------------------

  async findMyPosts(userId: string) {
    const posts = await this.prisma.orm.public.BlogPost.where({ authorId: userId })
      .include('author', (a) =>
        a.select('id', 'fullName', 'username', 'avatarUrl'),
      )
      .include('categories', (c) =>
        c.include('category', (cat) => cat.select('id', 'name', 'slug')),
      )
      .orderBy((p) => p.updatedAt.desc())
      .all();

    const postIds = posts.map((p) => p.id);
    const { likeCounts, commentCounts } = await getCountsForPosts(
      this.prisma,
      postIds,
    );

    return {
      posts: posts.map((p) => ({
        id: p.id,
        title: p.title,
        slug: p.slug,
        excerpt: p.excerpt,
        coverImage: p.coverImage,
        status: p.status,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        publishedAt: p.publishedAt,
        readingTime: p.readingTime,
        author: {
          id: (p.author as any).id,
          name: (p.author as any).fullName,
          username: (p.author as any).username,
          avatarUrl: (p.author as any).avatarUrl,
        },
        categories: (p.categories as any[]).map((c: any) => ({
          id: c.category.id,
          name: c.category.name,
          slug: c.category.slug,
        })),
        likeCount: likeCounts.get(p.id) ?? 0,
        commentCount: commentCounts.get(p.id) ?? 0,
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  async create(authorId: string, dto: CreatePostDto) {
    const slug = dto.slug || slugify(dto.title);

    const existing = await this.prisma.orm.public.BlogPost.where({
      slug,
    }).first();
    if (existing) {
      throw new ConflictException(`A post with slug "${slug}" already exists`);
    }

    if (dto.categoryIds?.length) {
      await this.categoryService.assertAllExist(dto.categoryIds);
    }

    const readingTime = Math.max(
      1,
      Math.ceil(dto.content.trim().split(/\s+/).length / 200),
    );

    const post = await this.prisma.orm.public.BlogPost.create({
      id: crypto.randomUUID(),
      title: dto.title,
      slug,
      excerpt: dto.excerpt || null,
      content: dto.content,
      coverImage: dto.coverImage || null,
      status: (dto.status || 'DRAFT') as any,
      readingTime,
      publishedAt:
        dto.status === 'PUBLISHED' ? new Date().toISOString() : null,
      authorId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    if (dto.categoryIds?.length) {
      for (const categoryId of dto.categoryIds) {
        await this.prisma.orm.public.BlogPostCategory.create({
          postId: post.id,
          categoryId,
        });
      }
    }

    return this.findBySlug(post.slug, authorId);
  }

  async update(postId: string, userId: string, dto: UpdatePostDto) {
    const post = await this.prisma.orm.public.BlogPost.where({
      id: postId,
    }).first();
    if (!post) {
      throw new NotFoundException('Post not found');
    }
    if (post.authorId !== userId) {
      throw new ForbiddenException('Not the author');
    }

    const updateData: Record<string, any> = {};
    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.slug !== undefined) updateData.slug = dto.slug;
    if (dto.excerpt !== undefined) updateData.excerpt = dto.excerpt;
    if (dto.content !== undefined) {
      updateData.content = dto.content;
      updateData.readingTime = Math.max(
        1,
        Math.ceil(dto.content.trim().split(/\s+/).length / 200),
      );
    }
    if (dto.coverImage !== undefined) updateData.coverImage = dto.coverImage;
    if (dto.status !== undefined) {
      updateData.status = dto.status;
      // Only set publishedAt the first time the post goes live
      if (dto.status === 'PUBLISHED' && !post.publishedAt) {
        updateData.publishedAt = new Date().toISOString();
      }
    }
    updateData.updatedAt = new Date().toISOString();

    await this.prisma.orm.public.BlogPost.where({ id: postId }).update(
      updateData,
    );

    if (dto.categoryIds !== undefined) {
      await this.prisma.orm.public.BlogPostCategory.where({ postId }).delete();

      for (const categoryId of dto.categoryIds) {
        await this.prisma.orm.public.BlogPostCategory.create({
          postId,
          categoryId,
        });
      }
    }

    return this.findBySlug(post.slug, userId);
  }

  async remove(postId: string, userId: string, role?: string) {
    const post = await this.prisma.orm.public.BlogPost.where({
      id: postId,
    }).first();
    if (!post) {
      throw new NotFoundException('Post not found');
    }
    if (post.authorId !== userId && role !== 'ADMIN') {
      throw new ForbiddenException('Not the author or admin');
    }

    // Cascade order: children first, then the post
    await this.prisma.orm.public.BlogComment.where({ postId }).delete();
    await this.prisma.orm.public.BlogPostLike.where({ postId }).delete();
    await this.prisma.orm.public.BlogPostCategory.where({ postId }).delete();
    await this.prisma.orm.public.BlogPost.where({ id: postId }).delete();

    return { success: true };
  }

  // ---------------------------------------------------------------------------
  // Likes
  // ---------------------------------------------------------------------------

  async toggleLike(postId: string, userId: string) {
    const post = await this.prisma.orm.public.BlogPost.where({
      id: postId,
    }).first();
    if (!post) {
      throw new NotFoundException('Post not found');
    }

    const existing = await this.prisma.orm.public.BlogPostLike.where({
      postId,
      userId,
    }).first();

    let liked: boolean;

    if (existing) {
      await this.prisma.orm.public.BlogPostLike.where({
        postId,
        userId,
      }).delete();
      liked = false;
    } else {
      try {
        await this.prisma.orm.public.BlogPostLike.create({
          id: crypto.randomUUID(),
          postId,
          userId,
          createdAt: new Date().toISOString(),
        });
        liked = true;
      } catch (error) {
        // A concurrent toggle may have just inserted the like (unique on
        // postId+userId). Treat that as "already liked" and unlike instead of
        // surfacing a 500.
        const code = (error as { code?: string })?.code;
        if (code !== 'P2002' && code !== '23505') {
          throw error;
        }
        await this.prisma.orm.public.BlogPostLike.where({
          postId,
          userId,
        }).delete();
        liked = false;
      }
    }

    // NOTE: Prisma 8 RC doesn't support top-level .count() — fetch and count.
    const likes = await this.prisma.orm.public.BlogPostLike.where({
      postId,
    }).all();
    const likeCount = likes.length;

    return { liked, likeCount };
  }

  // ---------------------------------------------------------------------------
  // Comments
  // ---------------------------------------------------------------------------

  async getComments(postId: string, page = 1, limit = 50) {
    const offset = (page - 1) * limit;

    const comments = await this.prisma.orm.public.BlogComment.where({ postId })
      .where((c) => c.parentId.isNull())
      .include('author', (a) =>
        a.select('id', 'fullName', 'username', 'avatarUrl'),
      )
      .include('replies', (r) =>
        r
          .include('author', (a) =>
            a.select('id', 'fullName', 'username', 'avatarUrl'),
          )
          .orderBy((reply) => reply.createdAt.asc()),
      )
      .orderBy((c) => c.createdAt.desc())
      .limit(limit)
      .offset(offset)
      .all();

    // NOTE: Prisma 8 RC doesn't support top-level .count() — fetch and count.
    const allTopLevel = await this.prisma.orm.public.BlogComment.where({
      postId,
    })
      .where((c) => c.parentId.isNull())
      .all();
    const total = allTopLevel.length;

    return {
      comments: comments.map((c) => ({
        id: c.id,
        body: c.body,
        createdAt: c.createdAt,
        author: {
          id: (c.author as any).id,
          name: (c.author as any).fullName,
          username: (c.author as any).username,
          avatarUrl: (c.author as any).avatarUrl,
        },
        replies: (c.replies as any[]).map((r: any) => ({
          id: r.id,
          body: r.body,
          createdAt: r.createdAt,
          author: {
            id: r.author.id,
            name: r.author.fullName,
            username: r.author.username,
            avatarUrl: r.author.avatarUrl,
          },
        })),
      })),
      total,
      page,
      limit,
    };
  }

  async createComment(postId: string, authorId: string, dto: CreateCommentDto) {
    const post = await this.prisma.orm.public.BlogPost.where({
      id: postId,
    }).first();
    if (!post) {
      throw new NotFoundException('Post not found');
    }

    if (dto.parentId) {
      const parent = await this.prisma.orm.public.BlogComment.where({
        id: dto.parentId,
        postId,
      }).first();
      if (!parent) {
        throw new NotFoundException('Parent comment not found');
      }
    }

    const comment = await this.prisma.orm.public.BlogComment.create({
      id: crypto.randomUUID(),
      body: dto.body,
      postId,
      authorId,
      parentId: dto.parentId || null,
      createdAt: new Date().toISOString(),
    });

    return {
      id: comment.id,
      body: comment.body, 
      createdAt: comment.createdAt,
    };
  }

  async removeComment(commentId: string, userId: string, role?: string) {
    const comment = await this.prisma.orm.public.BlogComment.where({
      id: commentId,
    }).first();
    if (!comment) {
      throw new NotFoundException('Comment not found');
    }
    if (comment.authorId !== userId && role !== 'ADMIN') {
      throw new ForbiddenException('Not the author or admin');
    }

    // Delete replies first, then the comment itself
    await this.prisma.orm.public.BlogComment.where({
      parentId: commentId,
    }).delete();
    await this.prisma.orm.public.BlogComment.where({ id: commentId }).delete();

    return { success: true };
  }

  // ---------------------------------------------------------------------------
  // Category passthroughs (delegated to CategoryService)
  // ---------------------------------------------------------------------------

  async findAllCategories() {
    return this.categoryService.findAll();
  }

  async createCategory(name: string, slug?: string) {
    return this.categoryService.create({ name, slug });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async getLikedPostIds(
    userId: string | undefined,
    postIds: string[],
  ): Promise<Set<string>> {
    if (!userId || postIds.length === 0) {
      return new Set();
    }

    const likes = await this.prisma.orm.public.BlogPostLike
      .where((l) => l.userId.eq(userId))
      .where((l) => l.postId.in(postIds))
      .all();

    return new Set(likes.map((l) => l.postId));
  }
}