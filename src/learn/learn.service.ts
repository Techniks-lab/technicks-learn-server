import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateLessonDto } from './dto/create-lesson.dto.js';
import { UpdateLessonDto } from './dto/update-lesson.dto.js';
import { XpService } from '../gamification/xp.service.js';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 200);
}

@Injectable()
export class LearnService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly xpService: XpService,
  ) {}

  private async getCompletedIds(userId?: string): Promise<Set<string>> {
    if (!userId) {
      return new Set<string>();
    }
    const rows = await this.prisma.orm.public.LessonCompletion.where((c) =>
      c.userId.eq(userId),
    ).all();
    return new Set(rows.map((r) => r.lessonId));
  }

  async findAll(userId?: string) {
    const lessons = await this.prisma.orm.public.Lesson.where((l) =>
      l.status.eq('PUBLISHED' as any),
    )
      .orderBy((l) => l.sortOrder.asc())
      .all();

    const completedIds = await this.getCompletedIds(userId);

    let blockCounts = new Map<string, number>();
    if (lessons.length > 0) {
      const blocks = await this.prisma.orm.public.LessonBlock.where((b) =>
        b.lessonId.in(lessons.map((l) => l.id)),
      ).all();
      const counts = new Map<string, number>();
      for (const b of blocks) {
        counts.set(b.lessonId, (counts.get(b.lessonId) ?? 0) + 1);
      }
      blockCounts = counts;
    }

    return {
      lessons: lessons.map((l) => ({
        id: l.id,
        slug: l.slug,
        title: l.title,
        description: l.description,
        courseId: l.courseId,
        sortOrder: l.sortOrder,
        createdAt: l.createdAt,
        updatedAt: l.updatedAt,
        blockCount: blockCounts.get(l.id) ?? 0,
        isCompleted: completedIds.has(l.id),
      })),
    };
  }

  async findBySlug(slug: string, userId?: string) {
    const lesson = await this.prisma.orm.public.Lesson.where({ slug }).first();
    if (!lesson) {
      throw new NotFoundException('Lesson not found');
    }

    const blocks = await this.prisma.orm.public.LessonBlock.where({
      lessonId: lesson.id,
    })
      .orderBy((b) => b.blockIndex.asc())
      .all();

    let isCompleted = false;
    if (userId) {
      const completion = await this.prisma.orm.public.LessonCompletion.where({
        lessonId: lesson.id,
        userId,
      }).first();
      isCompleted = !!completion;
    }

    return {
      id: lesson.id,
      slug: lesson.slug,
      title: lesson.title,
      description: lesson.description,
      status: lesson.status,
      courseId: lesson.courseId,
      sortOrder: lesson.sortOrder,
      createdAt: lesson.createdAt,
      updatedAt: lesson.updatedAt,
      isCompleted,
      blocks: blocks.map((b) => ({
        id: b.id,
        blockIndex: b.blockIndex,
        kind: b.kind,
        text: b.text,
        url: b.url,
        caption: b.caption,
      })),
    };
  }

  async complete(slug: string, userId: string) {
    const lesson = await this.prisma.orm.public.Lesson.where({ slug }).first();
    if (!lesson || lesson.status !== 'PUBLISHED') {
      throw new NotFoundException('Lesson not found');
    }

    const enrollment = await this.prisma.orm.public.CourseEnrollment.where({
      courseId: lesson.courseId,
      userId,
    }).first();
    if (!enrollment || enrollment.status !== 'ACTIVE') {
      throw new ForbiddenException(
        'You must be enrolled in the course to complete this lesson',
      );
    }

    const existing = await this.prisma.orm.public.LessonCompletion.where({
      lessonId: lesson.id,
      userId,
    }).first();

    if (existing) {
      const xp = await this.xpService.currentXp(userId);
      return { completed: true, xpAwarded: 0, xp };
    }

    try {
      await this.prisma.orm.public.LessonCompletion.create({
        id: crypto.randomUUID(),
        lessonId: lesson.id,
        userId,
        completedAt: new Date().toISOString(),
      });
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code !== 'P2002' && code !== '23505') {
        throw error;
      }
      const xp = await this.xpService.currentXp(userId);
      return { completed: true, xpAwarded: 0, xp };
    }

    const xpAwarded = 25;
    await this.xpService.award(userId, 'LESSON_COMPLETED', xpAwarded);

    return {
      completed: true,
      xpAwarded,
      xp: await this.xpService.currentXp(userId),
    };
  }

  async create(dto: CreateLessonDto) {
    const slug = dto.slug || slugify(dto.title);
    const existing = await this.prisma.orm.public.Lesson.where({
      slug,
    }).first();
    if (existing) {
      throw new ConflictException(
        `A lesson with slug "${slug}" already exists`,
      );
    }

    const now = new Date().toISOString();
    const lesson = await this.prisma.orm.public.Lesson.create({
      id: crypto.randomUUID(),
      slug,
      title: dto.title,
      description: dto.description ?? null,
      status: (dto.status ?? 'DRAFT') as any,
      sortOrder: dto.sortOrder ?? 0,
      courseId: dto.courseId,
      createdAt: now,
      updatedAt: now,
    });

    if (dto.blocks?.length) {
      for (const block of dto.blocks) {
        await this.prisma.orm.public.LessonBlock.create({
          id: crypto.randomUUID(),
          lessonId: lesson.id,
          blockIndex: block.blockIndex ?? 0,
          kind: block.kind as any,
          text: block.text ?? null,
          url: block.url ?? null,
          caption: block.caption ?? null,
        });
      }
    }

    return this.findBySlug(lesson.slug);
  }

  async update(lessonId: string, dto: UpdateLessonDto) {
    const lesson = await this.prisma.orm.public.Lesson.where({
      id: lessonId,
    }).first();
    if (!lesson) {
      throw new NotFoundException('Lesson not found');
    }

    const updateData: Record<string, any> = {};
    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.slug !== undefined) updateData.slug = dto.slug;
    if (dto.courseId !== undefined) updateData.courseId = dto.courseId;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.status !== undefined) updateData.status = dto.status as any;
    if (dto.sortOrder !== undefined) updateData.sortOrder = dto.sortOrder;
    updateData.updatedAt = new Date().toISOString();

    await this.prisma.orm.public.Lesson.where({ id: lessonId }).update(
      updateData,
    );

    if (dto.blocks !== undefined) {
      await this.prisma.orm.public.LessonBlock.where({ lessonId }).delete();
      for (const block of dto.blocks) {
        await this.prisma.orm.public.LessonBlock.create({
          id: crypto.randomUUID(),
          lessonId,
          blockIndex: block.blockIndex ?? 0,
          kind: block.kind as any,
          text: block.text ?? null,
          url: block.url ?? null,
          caption: block.caption ?? null,
        });
      }
    }

    return this.findBySlug(lesson.slug);
  }

  async remove(lessonId: string) {
    const lesson = await this.prisma.orm.public.Lesson.where({
      id: lessonId,
    }).first();
    if (!lesson) {
      throw new NotFoundException('Lesson not found');
    }

    await this.prisma.orm.public.LessonBlock.where({ lessonId }).delete();
    await this.prisma.orm.public.LessonCompletion.where({ lessonId }).delete();
    await this.prisma.orm.public.Lesson.where({ id: lessonId }).delete();

    return { success: true };
  }
}
