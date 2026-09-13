import { and, or } from '@prisma/orm-postgres/orm-client';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { XpService } from '../gamification/xp.service.js';
import { CreateCourseDto } from './dto/create-course.dto.js';
import { UpdateCourseDto } from './dto/update-course.dto.js';
import { CreateCourseCategoryDto } from './dto/create-course-category.dto.js';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 200);
}

function toDateKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function addDays(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return toDateKey(new Date(y, m - 1, d + n));
}

function computeStreaks(
  dates: string[],
  today: string,
): { streak: number; longestStreak: number } {
  const set = new Set(dates);

  let cursor = set.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (set.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  const unique = [...set].sort().reverse();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of unique) {
    if (prev !== null && addDays(d, 1) === prev) {
      run += 1;
    } else {
      run = 1;
    }
    longest = Math.max(longest, run);
    prev = d;
  }

  return { streak, longestStreak: longest };
}

@Injectable()
export class CoursesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly xpService: XpService,
  ) {}

  // ---------------------------------------------------------------------------
  // Public catalog
  // ---------------------------------------------------------------------------

  async findAll(userId?: string, query?: { search?: string; category?: string }) {
    const search = query?.search?.trim();
    const category = query?.category?.trim();

    let categoryId: string | undefined;
    if (category) {
      const cat = await this.prisma.orm.public.CourseCategory.where({
        slug: category,
      }).first();
      if (!cat) {
        return { courses: [] };
      }
      categoryId = cat.id;
    }

    let queryBuilder = this.prisma.orm.public.Course.where((c) =>
      c.status.eq('PUBLISHED'),
    );
    if (categoryId) {
      queryBuilder = queryBuilder.where((c) => c.categoryId.eq(categoryId));
    }
    if (search) {
      queryBuilder = queryBuilder.where((c) =>
        or(c.title.ilike(`%${search}%`), c.description.ilike(`%${search}%`)),
      );
    }

    const courses = await queryBuilder
      .include('lessons', (l) => l.count())
      .include('category', (cat) => cat.select('id', 'name', 'slug'))
      .orderBy((c) => c.sortOrder.asc())
      .all();

    const { enrollments, completedByCourse } = userId
      ? await this.getUserProgress(userId)
      : { enrollments: [], completedByCourse: new Map<string, number>() };

    const enrollmentByCourse = new Map<string, any>(
      enrollments.map((e) => [e.courseId, e]),
    );

    return {
      courses: courses.map((c) => {
        const enrollment = enrollmentByCourse.get(c.id);
        const categoryRow = (c.category as any) ?? null;
        return {
          id: c.id,
          slug: c.slug,
          title: c.title,
          description: c.description,
          coverImage: c.coverImage,
          status: c.status,
          sortOrder: c.sortOrder,
          publishedAt: c.publishedAt,
          category: categoryRow
            ? {
                id: categoryRow.id,
                name: categoryRow.name,
                slug: categoryRow.slug,
              }
            : null,
          lessonCount: (c.lessons as unknown as number | undefined) ?? 0,
          completedLessonCount: completedByCourse.get(c.id) ?? 0,
          isEnrolled: !!enrollment,
          enrollment: enrollment
            ? {
                status: enrollment.status,
                currentStreak: enrollment.currentStreak,
                longestStreak: enrollment.longestStreak,
                lastCheckInDate: enrollment.lastCheckInDate,
                enrolledAt: enrollment.enrolledAt,
              }
            : null,
        };
      }),
    };
  }

  async findMine(userId: string) {
    const enrollments = await this.prisma.orm.public.CourseEnrollment.where({
      userId,
    })
      .include('course', (c) =>
        c.select(
          'id',
          'slug',
          'title',
          'description',
          'coverImage',
          'status',
          'sortOrder',
          'publishedAt',
          'categoryId',
        ),
      )
      .orderBy((e) => e.enrolledAt.desc())
      .all();

    const { completedByCourse } = await this.getUserProgress(userId);

    const categoryIds = [
      ...new Set(
        enrollments
          .map((e) => (e.course as any).categoryId)
          .filter((x) => !!x),
      ),
    ];
    const categoryRows: any[] = categoryIds.length
      ? ((await this.prisma.orm.public.CourseCategory.where((c) =>
          c.id.in(categoryIds),
        ).all()) as any)
      : [];
    const categoryById = new Map(categoryRows.map((c) => [c.id, c]));

    return {
      courses: enrollments.map((e) => {
        const course = e.course as any;
        const category = categoryById.get(course.categoryId) ?? null;
        return {
          id: course.id,
          slug: course.slug,
          title: course.title,
          description: course.description,
          coverImage: course.coverImage,
          sortOrder: course.sortOrder,
          publishedAt: course.publishedAt,
          category: category
            ? { id: category.id, name: category.name, slug: category.slug }
            : null,
          enrollment: {
            id: e.id,
            status: e.status,
            enrolledAt: e.enrolledAt,
            currentStreak: e.currentStreak,
            longestStreak: e.longestStreak,
            lastCheckInDate: e.lastCheckInDate,
            completedLessonCount: completedByCourse.get(course.id) ?? 0,
          },
        };
      }),
    };
  }

  async findBySlug(slug: string, userId?: string) {
    const course = await this.prisma.orm.public.Course.where({ slug }).first();
    if (!course || course.status !== 'PUBLISHED') {
      throw new NotFoundException('Course not found');
    }

    const lessons = await this.prisma.orm.public.Lesson.where((l) =>
      and(l.courseId.eq(course.id), l.status.eq('PUBLISHED')),
    )
      .orderBy((l) => l.sortOrder.asc())
      .all();

    let enrollment: any = null;
    let completedIds = new Set<string>();

    if (userId) {
      enrollment = await this.prisma.orm.public.CourseEnrollment.where({
        courseId: course.id,
        userId,
      }).first();

      if (enrollment) {
        const completions = await this.prisma.orm.public.LessonCompletion.where(
          (c) =>
            and(c.userId.eq(userId), c.lessonId.in(lessons.map((l) => l.id))),
        ).all();
        completedIds = new Set(completions.map((c) => c.lessonId));
      }
    }

    const category = course.categoryId
      ? ((await this.prisma.orm.public.CourseCategory.where({
          id: course.categoryId,
        }).first()) as any)
      : null;

    return {
      id: course.id,
      slug: course.slug,
      title: course.title,
      description: course.description,
      coverImage: course.coverImage,
      status: course.status,
      sortOrder: course.sortOrder,
      publishedAt: course.publishedAt,
      createdAt: course.createdAt,
      updatedAt: course.updatedAt,
      category: category
        ? { id: category.id, name: category.name, slug: category.slug }
        : null,
      enrollment: enrollment
        ? {
            id: enrollment.id,
            status: enrollment.status,
            enrolledAt: enrollment.enrolledAt,
            currentStreak: enrollment.currentStreak,
            longestStreak: enrollment.longestStreak,
            lastCheckInDate: enrollment.lastCheckInDate,
          }
        : null,
      lessons: lessons.map((l) => ({
        id: l.id,
        slug: l.slug,
        title: l.title,
        description: l.description,
        sortOrder: l.sortOrder,
        isCompleted: completedIds.has(l.id),
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // Enrollment
  // ---------------------------------------------------------------------------

  async enroll(slug: string, userId: string) {
    const course = await this.prisma.orm.public.Course.where({ slug }).first();
    if (!course || course.status !== 'PUBLISHED') {
      throw new NotFoundException('Course not found');
    }

    const existing = await this.prisma.orm.public.CourseEnrollment.where({
      courseId: course.id,
      userId,
    }).first();
    if (existing) {
      return {
        enrolled: true,
        alreadyEnrolled: true,
        enrollment: {
          id: existing.id,
          status: existing.status,
          enrolledAt: existing.enrolledAt,
          currentStreak: existing.currentStreak,
          longestStreak: existing.longestStreak,
        },
        course: { id: course.id, slug: course.slug, title: course.title },
      };
    }

    let enrollment: any;
    try {
      const now = new Date().toISOString();
      enrollment = await this.prisma.orm.public.CourseEnrollment.create({
        id: crypto.randomUUID(),
        courseId: course.id,
        userId,
        status: 'ACTIVE',
        enrolledAt: now,
        currentStreak: 0,
        longestStreak: 0,
        lastCheckInDate: null,
      });
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code !== 'P2002' && code !== '23505') {
        throw error;
      }
      enrollment = await this.prisma.orm.public.CourseEnrollment.where({
        courseId: course.id,
        userId,
      }).first();
    }

    return {
      enrolled: true,
      alreadyEnrolled: false,
      enrollment: {
        id: enrollment.id,
        status: enrollment.status,
        enrolledAt: enrollment.enrolledAt,
        currentStreak: enrollment.currentStreak,
        longestStreak: enrollment.longestStreak,
      },
      course: { id: course.id, slug: course.slug, title: course.title },
    };
  }

  async checkIn(slug: string, userId: string, dateOverride?: string) {
    const course = await this.prisma.orm.public.Course.where({ slug }).first();
    if (!course || course.status !== 'PUBLISHED') {
      throw new NotFoundException('Course not found');
    }

    const enrollment = await this.prisma.orm.public.CourseEnrollment.where({
      courseId: course.id,
      userId,
    }).first();
    if (!enrollment || enrollment.status !== 'ACTIVE') {
      throw new UnauthorizedException('You are not enrolled in this course');
    }

    const date = dateOverride || toDateKey(new Date());

    const existing = await this.prisma.orm.public.CheckIn.where({
      enrollmentId: enrollment.id,
      date,
    }).first();
    if (existing) {
      return {
        checkedInToday: true,
        streak: enrollment.currentStreak,
        longestStreak: enrollment.longestStreak,
        xpAwarded: 0,
        xp: await this.xpService.currentXp(userId),
      };
    }

    try {
      await this.prisma.orm.public.CheckIn.create({
        id: crypto.randomUUID(),
        enrollmentId: enrollment.id,
        date,
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code !== 'P2002' && code !== '23505') {
        throw error;
      }
      return {
        checkedInToday: true,
        streak: enrollment.currentStreak,
        longestStreak: enrollment.longestStreak,
        xpAwarded: 0,
        xp: await this.xpService.currentXp(userId),
      };
    }

    const all = await this.prisma.orm.public.CheckIn.where({
      enrollmentId: enrollment.id,
    }).all();
    const dates = all.map((c) => c.date);
    const { streak, longestStreak } = computeStreaks(dates, date);

    const bonus = Math.min(20, Math.max(0, (streak - 1) * 2));
    const xpAwarded = 10 + bonus;
    await this.xpService.award(userId, 'DAILY_CHECK_IN', xpAwarded);

    await this.prisma.orm.public.CourseEnrollment.where({
      id: enrollment.id,
    }).update({
      currentStreak: streak,
      longestStreak: longestStreak,
      lastCheckInDate: date,
    });

    return {
      checkedInToday: true,
      streak,
      longestStreak,
      xpAwarded,
      xp: await this.xpService.currentXp(userId),
    };
  }

  async unenroll(slug: string, userId: string) {
    const course = await this.prisma.orm.public.Course.where({ slug }).first();
    if (!course || course.status !== 'PUBLISHED') {
      throw new NotFoundException('Course not found');
    }

    const enrollment = await this.prisma.orm.public.CourseEnrollment.where({
      courseId: course.id,
      userId,
    }).first();
    if (!enrollment) {
      return {
        unenrolled: false,
        course: { id: course.id, slug: course.slug },
      };
    }

    await this.prisma.orm.public.CourseEnrollment.where({ id: enrollment.id })
      .delete();

    return {
      unenrolled: true,
      course: { id: course.id, slug: course.slug },
    };
  }

  // ---------------------------------------------------------------------------
  // Categories
  // ---------------------------------------------------------------------------

  async listCategories() {
    const categories = await this.prisma.orm.public.CourseCategory.include(
      'courses',
      (c) => c.count(),
    )
      .orderBy((c) => c.name.asc())
      .all();

    return {
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        courseCount: (c.courses as unknown as number) ?? 0,
      })),
    };
  }

  async createCategory(dto: CreateCourseCategoryDto) {
    const slug = dto.slug ?? slugify(dto.name);

    const existing = await this.prisma.orm.public.CourseCategory.where((c) =>
      or(c.slug.eq(slug), c.name.eq(dto.name)),
    ).first();
    if (existing) {
      return { id: existing.id, name: existing.name, slug: existing.slug };
    }

    const now = new Date().toISOString();
    const created = await this.prisma.orm.public.CourseCategory.create({
      id: crypto.randomUUID(),
      name: dto.name,
      slug,
      createdAt: now,
      updatedAt: now,
    });

    return { id: created.id, name: created.name, slug: created.slug };
  }

  async deleteCategory(id: string, force = false) {
    const category = await this.prisma.orm.public.CourseCategory.include(
      'courses',
      (c) => c.count(),
    )
      .where({ id })
      .first();
    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const courseCount = (category.courses as unknown as number) ?? 0;
    if (courseCount > 0 && !force) {
      throw new ConflictException(
        `Category has ${courseCount} course(s). Re-run with ?force=true to detach them.`,
      );
    }

    if (courseCount > 0) {
      await this.prisma.orm.public.Course.where({ categoryId: id }).update({
        categoryId: null,
      });
    }

    await this.prisma.orm.public.CourseCategory.where({ id }).delete();

    return { success: true, detachedCourses: courseCount };
  }

  // ---------------------------------------------------------------------------
  // Admin
  // ---------------------------------------------------------------------------

  async create(dto: CreateCourseDto) {
    const slug = dto.slug || slugify(dto.title);
    const existing = await this.prisma.orm.public.Course.where({
      slug,
    }).first();
    if (existing) {
      throw new ConflictException(
        `A course with slug "${slug}" already exists`,
      );
    }

    if (dto.categoryId) {
      const category = await this.prisma.orm.public.CourseCategory.where({
        id: dto.categoryId,
      }).first();
      if (!category) {
        throw new NotFoundException('Course category not found');
      }
    }

    const now = new Date().toISOString();
    const course = await this.prisma.orm.public.Course.create({
      id: crypto.randomUUID(),
      slug,
      title: dto.title,
      description: dto.description ?? null,
      coverImage: dto.coverImage ?? null,
      status: (dto.status ?? 'DRAFT') as any,
      sortOrder: dto.sortOrder ?? 0,
      categoryId: dto.categoryId ?? null,
      publishedAt: dto.status === 'PUBLISHED' ? now : null,
      createdAt: now,
      updatedAt: now,
    });

    return course;
  }

  async update(courseId: string, dto: UpdateCourseDto) {
    const course = await this.prisma.orm.public.Course.where({
      id: courseId,
    }).first();
    if (!course) {
      throw new NotFoundException('Course not found');
    }

    const updateData: Record<string, any> = {};
    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.slug !== undefined) updateData.slug = dto.slug;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.coverImage !== undefined) updateData.coverImage = dto.coverImage;
    if (dto.categoryId !== undefined) {
      if (dto.categoryId !== null) {
        const category = await this.prisma.orm.public.CourseCategory.where({
          id: dto.categoryId,
        }).first();
        if (!category) {
          throw new NotFoundException('Course category not found');
        }
      }
      updateData.categoryId = dto.categoryId;
    }
    if (dto.status !== undefined) {
      updateData.status = dto.status as any;
      if (dto.status === 'PUBLISHED' && course.status !== 'PUBLISHED') {
        updateData.publishedAt = new Date().toISOString();
      }
    }
    if (dto.sortOrder !== undefined) updateData.sortOrder = dto.sortOrder;
    updateData.updatedAt = new Date().toISOString();

    const updated = await this.prisma.orm.public.Course.where({
      id: courseId,
    }).update(updateData);

    return updated;
  }

  async remove(courseId: string) {
    const course = await this.prisma.orm.public.Course.where({
      id: courseId,
    }).first();
    if (!course) {
      throw new NotFoundException('Course not found');
    }

    await this.prisma.orm.public.CourseEnrollment.where({ courseId }).delete();
    await this.prisma.orm.public.LessonCompletion.where({
      lessonId: await this.lessonIdsForCourse(courseId),
    }).delete();
    await this.prisma.orm.public.LessonBlock.where({
      lessonId: await this.lessonIdsForCourse(courseId),
    }).delete();
    await this.prisma.orm.public.Lesson.where({ courseId }).delete();
    await this.prisma.orm.public.Course.where({ id: courseId }).delete();

    return { success: true };
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private async getUserProgress(userId: string) {
    const enrollments = await this.prisma.orm.public.CourseEnrollment.where({
      userId,
    }).all();

    const completions = await this.prisma.orm.public.LessonCompletion.where(
      (c) => c.userId.eq(userId),
    ).all();
    const lessonIds = completions.map((c) => c.lessonId);

    const completedByCourse = new Map<string, number>();
    if (lessonIds.length > 0) {
      const lessons = await this.prisma.orm.public.Lesson.where((l) =>
        l.id.in(lessonIds),
      ).all();
      for (const lesson of lessons) {
        completedByCourse.set(
          lesson.courseId,
          (completedByCourse.get(lesson.courseId) ?? 0) + 1,
        );
      }
    }

    return { enrollments, completedByCourse };
  }

  private async lessonIdsForCourse(courseId: string): Promise<string[]> {
    const lessons = await this.prisma.orm.public.Lesson.where({
      courseId,
    }).all();
    return lessons.map((l) => l.id);
  }
}
