import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateLessonDto } from './dto/create-lesson.dto.js';
import { UpdateLessonDto } from './dto/update-lesson.dto.js';
import { LessonQuizDto } from './dto/lesson-quiz.dto.js';
import { XpService } from '../gamification/xp.service.js';
import { GamificationService } from '../gamification/gamification.service.js';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 200);
}

const DEFAULT_PASS_PERCENTAGE = 70;

interface QuizQuestion {
  prompt: string;
  options: string[];
  correctIndex: number;
}

interface LessonQuizData {
  title?: string;
  passPercentage?: number;
  questions: QuizQuestion[];
}

function parseQuizData(raw: string | null | undefined): LessonQuizData | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<LessonQuizData>;
    if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
      return null;
    }
    const questions = parsed.questions
      .filter(
        (q): q is QuizQuestion =>
          !!q &&
          typeof q.prompt === 'string' &&
          Array.isArray(q.options) &&
          q.options.length > 0 &&
          typeof q.correctIndex === 'number',
      )
      .map((q) => ({
        prompt: q.prompt,
        options: q.options.map(String),
        correctIndex: q.correctIndex,
      }));
    if (questions.length === 0) {
      return null;
    }
    return {
      title: typeof parsed.title === 'string' ? parsed.title : undefined,
      passPercentage:
        typeof parsed.passPercentage === 'number' &&
        parsed.passPercentage > 0 &&
        parsed.passPercentage <= 100
          ? parsed.passPercentage
          : DEFAULT_PASS_PERCENTAGE,
      questions,
    };
  } catch {
    return null;
  }
}

function serializeQuizData(data: unknown): string | null {
  if (data === undefined || data === null) {
    return null;
  }
  return JSON.stringify(data);
}

@Injectable()
export class LearnService {
  private readonly logger = new Logger(LearnService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly xpService: XpService,
    private readonly gamificationService: GamificationService,
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

  // ---------------------------------------------------------------------------
  // Admin (drafts included)
  // ---------------------------------------------------------------------------

  async findAllAdmin(query?: { courseId?: string; status?: string }) {
    const courseId = query?.courseId?.trim();
    const status =
      query?.status && query.status !== 'ALL' ? query.status : undefined;

    let builder = this.prisma.orm.public.Lesson.where(
      status ? ({ status } as any) : {},
    );
    if (courseId) {
      builder = builder.where((l) => l.courseId.eq(courseId));
    }

    const lessons = await builder.orderBy((l) => l.sortOrder.asc()).all();

    const blockCounts = new Map<string, number>();
    if (lessons.length > 0) {
      const blocks = await this.prisma.orm.public.LessonBlock.where((b) =>
        b.lessonId.in(lessons.map((l) => l.id)),
      ).all();
      for (const b of blocks) {
        blockCounts.set(b.lessonId, (blockCounts.get(b.lessonId) ?? 0) + 1);
      }
    }

    return {
      lessons: lessons.map((l) => ({
        id: l.id,
        slug: l.slug,
        title: l.title,
        description: l.description,
        status: l.status,
        courseId: l.courseId,
        sortOrder: l.sortOrder,
        createdAt: l.createdAt,
        updatedAt: l.updatedAt,
        blockCount: blockCounts.get(l.id) ?? 0,
      })),
    };
  }

  /**
   * Author-facing lesson read: returns QUIZ block data verbatim, including
   * `correctIndex`, so an admin editor can round-trip the answer key.
   * Never expose this to students — public reads must strip answers.
   */
  async findForAuthor(lessonId: string) {
    const lesson = await this.prisma.orm.public.Lesson.where({
      id: lessonId,
    }).first();
    if (!lesson) {
      throw new NotFoundException('Lesson not found');
    }

    const blocks = await this.prisma.orm.public.LessonBlock.where({
      lessonId,
    })
      .orderBy((b) => b.blockIndex.asc())
      .all();

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
      blocks: blocks.map((b) => ({
        id: b.id,
        blockIndex: b.blockIndex,
        kind: b.kind,
        text: b.text,
        url: b.url,
        caption: b.caption,
        data: b.kind === 'QUIZ' ? parseQuizData(b.data) : null,
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
    let quizResult: {
      passed: boolean;
      score: number;
      total: number;
      answeredAt: string;
    } | null = null;
    if (userId) {
      const completion = await this.prisma.orm.public.LessonCompletion.where({
        lessonId: lesson.id,
        userId,
      }).first();
      isCompleted = !!completion;

      const latestAttempt =
        await this.prisma.orm.public.LessonQuizAttempt.where({
          lessonId: lesson.id,
          userId,
        })
          .orderBy((a) => a.answeredAt.desc())
          .first();
      if (latestAttempt) {
        quizResult = {
          passed: latestAttempt.passed,
          score: latestAttempt.score,
          total: latestAttempt.total,
          answeredAt: latestAttempt.answeredAt,
        };
      }
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
      quizResult,
      blocks: blocks.map((b) => {
        let data: unknown = null;
        if (b.kind === 'QUIZ') {
          const parsed = parseQuizData(b.data);
          if (parsed) {
            data = {
              title: parsed.title,
              passPercentage: parsed.passPercentage,
              questions: parsed.questions.map((q) => ({
                prompt: q.prompt,
                options: q.options,
              })),
            };
          }
        }
        return {
          id: b.id,
          blockIndex: b.blockIndex,
          kind: b.kind,
          text: b.text,
          url: b.url,
          caption: b.caption,
          data,
        };
      }),
    };
  }

  private async hasPassedQuiz(lessonId: string, userId: string) {
    const attempt = await this.prisma.orm.public.LessonQuizAttempt.where({
      lessonId,
      userId,
      passed: true,
    }).first();
    return !!attempt;
  }

  async submitQuiz(slug: string, userId: string, dto: LessonQuizDto) {
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
        'You must be enrolled in the course to take this quiz',
      );
    }

    const blocks = await this.prisma.orm.public.LessonBlock.where({
      lessonId: lesson.id,
    })
      .orderBy((b) => b.blockIndex.asc())
      .all();

    const questionSets = blocks
      .filter((b) => b.kind === 'QUIZ')
      .map((b) => parseQuizData(b.data))
      .filter((d): d is LessonQuizData => d !== null);

    if (questionSets.length === 0) {
      throw new NotFoundException('This lesson has no quiz to submit');
    }

    const passPercentage =
      questionSets[0].passPercentage ?? DEFAULT_PASS_PERCENTAGE;
    const questions: QuizQuestion[] = questionSets.flatMap((d) => d.questions);
    const total = questions.length;

    const answers = dto.answers;
    const answerResults: boolean[] = [];
    let score = 0;
    const correctAnswers: number[] = [];
    for (let i = 0; i < total; i++) {
      correctAnswers.push(questions[i].correctIndex);
      answerResults.push(answers[i] === questions[i].correctIndex);
      if (answerResults[i]) {
        score++;
      }
    }

    const passed = score / total >= passPercentage / 100;

    const attemptId = crypto.randomUUID();
    await this.prisma.orm.public.LessonQuizAttempt.create({
      id: attemptId,
      lessonId: lesson.id,
      userId,
      score,
      total,
      passed,
    });

    // Snapshot every submitted answer (question index, selected option, and the
    // correct option at the time) so per-question analytics stay valid even if
    // the quiz is edited later. Attempts are per-user, per-lesson, private.
    for (let i = 0; i < total; i++) {
      await this.prisma.orm.public.LessonQuizAnswer.create({
        attemptId,
        questionIndex: i,
        selectedIndex: answers[i],
        correctIndex: questions[i].correctIndex,
        isCorrect: answerResults[i],
      });
    }

    // A passing quiz is the day's learning activity, so it records the user's
    // global daily check-in — this is what grows the streak now, and the
    // manual "Check in" button is no longer needed.
    const checkIn = passed ? await this.recordUserCheckIn(userId) : null;

    return {
      lessonId: lesson.id,
      passed,
      score,
      total,
      passPercentage,
      correctAnswers,
      checkIn,
    };
  }

  private async recordUserCheckIn(userId: string) {
    try {
      return await this.gamificationService.recordDailyCheckIn(userId);
    } catch (error) {
      this.logger.error(
        `Quiz passed but failed to record daily check-in for user ${userId}`,
        error,
      );
      return null;
    }
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

    const blocks = await this.prisma.orm.public.LessonBlock.where({
      lessonId: lesson.id,
    }).all();
    const hasQuiz = blocks.some(
      (b) => b.kind === 'QUIZ' && parseQuizData(b.data) !== null,
    );
    if (hasQuiz && !(await this.hasPassedQuiz(lesson.id, userId))) {
      throw new ForbiddenException(
        'Pass the lesson quiz before marking this lesson complete',
      );
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
      this.assertValidQuizBlocks(dto.blocks);
      for (const block of dto.blocks) {
        await this.prisma.orm.public.LessonBlock.create({
          id: crypto.randomUUID(),
          lessonId: lesson.id,
          blockIndex: block.blockIndex ?? 0,
          kind: block.kind as any,
          text: block.text ?? null,
          url: block.url ?? null,
          caption: block.caption ?? null,
          data: serializeQuizData(block.data),
        });
      }
    }

    return this.findBySlug(lesson.slug);
  }

  /**
   * A QUIZ block with malformed data can never be passed, which would soft-lock
   * lesson completion. Reject bad payloads at write time instead of read time.
   */
  private assertValidQuizBlocks(
    blocks: { kind: string; data?: Record<string, unknown> }[],
  ) {
    for (const block of blocks) {
      if (block.kind !== 'QUIZ') continue;
      if (!parseQuizData(JSON.stringify(block.data ?? null))) {
        throw new BadRequestException(
          'QUIZ blocks require data: { title?, passPercentage?, questions: [{ prompt, options: string[], correctIndex }] }',
        );
      }
    }
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
      this.assertValidQuizBlocks(dto.blocks);
      await this.prisma.deleteMany(
        this.prisma.sql.public.lessonBlock,
        (f: any, fns: any) => fns.eq(f.lessonId, lessonId),
      );
      for (const block of dto.blocks) {
        await this.prisma.orm.public.LessonBlock.create({
          id: crypto.randomUUID(),
          lessonId,
          blockIndex: block.blockIndex ?? 0,
          kind: block.kind as any,
          text: block.text ?? null,
          url: block.url ?? null,
          caption: block.caption ?? null,
          data: serializeQuizData(block.data),
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
