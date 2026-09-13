import 'dotenv/config';
import bcrypt from 'bcrypt';
import postgres from '@prisma/orm-postgres/runtime';
import contractJson from '../src/prisma/contract.json' with { type: 'json' };

const db = postgres({
  contractJson,
  url: process.env.DATABASE_URL,
});

const orm = db.orm.public;

function toDateKey(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function weekBounds(date) {
  const start = new Date(date);
  const day = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start, end };
}

// ---------------------------------------------------------------------------
// Course (matches the default course backfilled by the migration)
// ---------------------------------------------------------------------------

const COURSE_ID = '11111111-1111-4111-8111-111111111111';

const course = {
  id: COURSE_ID,
  slug: 'getting-started',
  title: 'Getting Started',
  description:
    'The starter course behind everything in Learn: run the project, understand the stack, and ship a feature.',
  coverImage: 'https://picsum.photos/seed/technicks-course/1200/675',
  status: 'PUBLISHED',
  sortOrder: 1,
};

// ---------------------------------------------------------------------------
// Course categories
// ---------------------------------------------------------------------------

const FUNDAMENTALS_SLUG = 'fundamentals';

// ---------------------------------------------------------------------------
// Lessons
// ---------------------------------------------------------------------------

const lessons = [
  {
    slug: 'getting-started',
    title: 'Getting Started',
    description: 'Install, run, and understand the project structure.',
    sortOrder: 1,
    blocks: [
      { blockIndex: 0, kind: 'HEADING', text: 'Welcome to Technicks Learn', url: null, caption: null },
      {
        blockIndex: 1,
        kind: 'TEXT',
        text: 'This lesson walks you through running the project, the folder layout, and where everything lives. By the end you will know how to fire up the dev server, hit the API, and find the code you are looking for.',
        url: null,
        caption: null,
      },
      {
        blockIndex: 2,
        kind: 'IMAGE',
        text: null,
        url: 'https://picsum.photos/seed/technicks-learn/1200/675',
        caption: 'The Technicks Learn stack overview',
      },
      {
        blockIndex: 3,
        kind: 'VIDEO',
        text: null,
        url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
        caption: 'A sample video — replace me with your own content',
      },
      {
        blockIndex: 4,
        kind: 'TEXT',
        text: 'Mark this lesson as complete when the project is running locally and you have opened the Swagger docs at /docs.',
        url: null,
        caption: null,
      },
    ],
  },
  {
    slug: 'core-concepts',
    title: 'Core Concepts',
    description: 'Data contracts, migrations, and the request lifecycle.',
    sortOrder: 2,
    blocks: [
      { blockIndex: 0, kind: 'HEADING', text: 'How a request flows through the stack', url: null, caption: null },
      {
        blockIndex: 1,
        kind: 'TEXT',
        text: 'Every request hits the NestJS router, passes through guards, lands in a controller, and gets fulfilled by a service that talks to Prisma. Responses are polymorphic and typed on the client through generated SDKs.',
        url: null,
        caption: null,
      },
      { blockIndex: 2, kind: 'HEADING', text: 'Data contracts', url: null, caption: null },
      {
        blockIndex: 3,
        kind: 'TEXT',
        text: 'The database schema is defined once in contract.prisma. Running prisma contract emit regenerates contract.json, and migrations are snapshot-based packages under migrations/ — additive by default so they can be safely planned and applied.',
        url: null,
        caption: null,
      },
      { blockIndex: 4, kind: 'HEADING', text: 'XP and streaks', url: null, caption: null },
      {
        blockIndex: 5,
        kind: 'TEXT',
        text: 'Complete lessons for XP, check in daily to grow your streak, and climb the weekly leaderboard tier table: Gold for the top 3, Silver for ranks 4–10, Bronze for the rest.',
        url: null,
        caption: null,
      },
    ],
  },
  {
    slug: 'build-your-first-feature',
    title: 'Build Your First Feature',
    description: 'Ship a real, tested feature end to end.',
    sortOrder: 3,
    blocks: [
      { blockIndex: 0, kind: 'HEADING', text: 'Plan, then ship', url: null, caption: null },
      {
        blockIndex: 1,
        kind: 'TEXT',
        text: 'Every feature follows the same arc: add the data model to the contract, plan and apply the migration, build the NestJS module, regenerate the client SDK, and wire up the screen with a typed API wrapper and a React Query hook.',
        url: null,
        caption: null,
      },
      { blockIndex: 2, kind: 'HEADING', text: 'Test your work', url: null, caption: null },
      {
        blockIndex: 3,
        kind: 'TEXT',
        text: 'Run tsc and the linter, then exercise the new endpoint with curl before touching the UI. A green API is the foundation of a green screen.',
        url: null,
        caption: null,
      },
      {
        blockIndex: 4,
        kind: 'VIDEO',
        text: null,
        url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
        caption: 'Sample video — the final screen in action',
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Demo users (leaderboard + streaks)
// ---------------------------------------------------------------------------

const demo = [
  { email: 'demo-1@example.com', fullName: 'Ava Thompson', username: 'avabuilds', xp: 240 },
  { email: 'demo-2@example.com', fullName: 'Liam Carter', username: 'liamc', xp: 180 },
  { email: 'demo-3@example.com', fullName: 'Maya Patel', username: 'mayadev', xp: 150 },
  { email: 'demo-4@example.com', fullName: 'Noah Kim', username: 'noahk', xp: 120 },
  { email: 'demo-5@example.com', fullName: 'Zoe Wang', username: 'zoewang', xp: 100 },
  { email: 'demo-6@example.com', fullName: 'Ethan Reed', username: 'ethanr', xp: 80 },
  { email: 'demo-7@example.com', fullName: 'Isla Moore', username: 'islam', xp: 60 },
  { email: 'demo-8@example.com', fullName: 'Luca Bianchi', username: 'lucab', xp: 40 },
];

async function main() {
  const passwordHash = bcrypt.hashSync('Password123', 10);

  let categoryId;
  const funds = await orm.CourseCategory.where({ slug: FUNDAMENTALS_SLUG }).first();
  if (funds) {
    categoryId = funds.id;
  } else {
    const created = await orm.CourseCategory.create({
      id: crypto.randomUUID(),
      name: 'Fundamentals',
      slug: 'fundamentals',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    categoryId = created.id;
    console.log('created category fundamentals');
  }

  const existingCourse = await orm.Course.where({ id: COURSE_ID }).first();
  if (existingCourse) {
    if (existingCourse.categoryId !== categoryId) {
      await orm.Course.where({ id: COURSE_ID }).update({ categoryId });
      console.log('assigned category to getting-started');
    } else {
      console.log('course getting-started exists, skipping');
    }
  } else {
    const now = new Date().toISOString();
    await orm.Course.create({
      ...course,
      categoryId,
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    console.log('created course getting-started');
  }

  for (const lesson of lessons) {
    const existing = await orm.Lesson.where({ slug: lesson.slug }).first();
    if (existing) {
      console.log(`lesson ${lesson.slug} exists, skipping`);
      continue;
    }
    const now = new Date().toISOString();
    const created = await orm.Lesson.create({
      id: crypto.randomUUID(),
      slug: lesson.slug,
      title: lesson.title,
      description: lesson.description,
      status: 'PUBLISHED',
      sortOrder: lesson.sortOrder,
      courseId: COURSE_ID,
      createdAt: now,
      updatedAt: now,
    });
    for (const b of lesson.blocks) {
      await orm.LessonBlock.create({
        id: crypto.randomUUID(),
        lessonId: created.id,
        blockIndex: b.blockIndex,
        kind: b.kind,
        text: b.text,
        url: b.url,
        caption: b.caption,
      });
    }
    console.log(`created lesson ${lesson.slug}`);
  }

  const { start, end } = weekBounds(new Date());
  let competition = await orm.Competition.where({ startsAt: start.toISOString(), endsAt: end.toISOString() }).first();
  if (!competition) {
    competition = await orm.Competition.create({
      id: crypto.randomUUID(),
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      createdAt: new Date().toISOString(),
    });
    console.log('created current weekly competition');
  }

  const today = new Date();
  for (const d of demo) {
    const now = new Date().toISOString();
    let user = await orm.User.where({ email: d.email }).first();
    if (!user) {
      const takenUsername = await orm.User.where({ username: d.username }).first();
      if (takenUsername) {
        console.log(`user ${d.email} skipped (username ${d.username} taken)`);
        continue;
      }
      user = await orm.User.create({
        id: crypto.randomUUID(),
        email: d.email,
        passwordHash,
        fullName: d.fullName,
        username: d.username,
        role: 'STUDENT',
        isVerified: true,
        isActive: true,
        xp: d.xp,
        createdAt: now,
        updatedAt: now,
        lastActiveAt: now,
      });

      // XP events split into a couple of plausible awards.
      const lessonPart = Math.round(d.xp * 0.6 / 25) * 25;
      const first = Math.min(lessonPart, d.xp);
      const second = d.xp - first;
      const award = (amount, source) =>
        amount > 0
          ? orm.XpEvent.create({
              id: crypto.randomUUID(),
              userId: user.id,
              source,
              amount,
              createdAt: new Date(Date.now() - 1000 * 60 * Math.floor(Math.random() * 240 + 60)).toISOString(),
            })
          : Promise.resolve();
      await award(first, 'LESSON_COMPLETED');
      await award(second, 'DAILY_CHECK_IN');

      await orm.CompetitionMember.create({
        id: crypto.randomUUID(),
        competitionId: competition.id,
        userId: user.id,
        points: d.xp,
        joinedAt: now,
      });

      console.log(`created demo user ${d.email} (${d.xp} xp)`);
    }

    // Enroll the demo user in the course (idempotent).
    let enrollment = await orm.CourseEnrollment.where({
      courseId: COURSE_ID,
      userId: user.id,
    }).first();
    if (!enrollment) {
      enrollment = await orm.CourseEnrollment.create({
        id: crypto.randomUUID(),
        courseId: COURSE_ID,
        userId: user.id,
        status: 'ACTIVE',
        enrolledAt: now,
      });
      console.log(`enrolled ${d.email}`);
    }

    // Streak: N consecutive days ending today (N = 1 + index % 5) on the
    // course enrollment.
    const streakDays = 1 + demo.indexOf(d) % 5;
    for (let i = 0; i < streakDays; i++) {
      const dt = new Date(today);
      dt.setDate(dt.getDate() - i);
      const key = toDateKey(dt);
      const checkIn = await orm.CheckIn.where({
        enrollmentId: enrollment.id,
        date: key,
      }).first();
      if (!checkIn) {
        await orm.CheckIn.create({
          id: crypto.randomUUID(),
          enrollmentId: enrollment.id,
          date: key,
          createdAt: dt.toISOString(),
        });
      }
    }
  }

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => process.exit(0));