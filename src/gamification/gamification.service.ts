import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { XpService } from './xp.service.js';
import { computeStreaks, toDateKey } from './streak.util.js';

export type CompetitionTier = 'GOLD' | 'SILVER' | 'BRONZE';

export function tierForRank(rank: number): CompetitionTier {
  if (rank <= 3) return 'GOLD';
  if (rank <= 10) return 'SILVER';
  return 'BRONZE';
}
 
function weekBounds(date: Date): { start: Date; end: Date } {
  const start = new Date(date);
  const day = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - day);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 7);

  return { start, end };
}

@Injectable()
export class GamificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly xpService: XpService,
  ) {}

  async getMe(userId: string) {
    const user = await this.prisma.orm.public.User.where({
      id: userId,
    }).first();

    const today = toDateKey(new Date());
    const currentStreak = user?.currentStreak ?? 0;

    return {
      xp: user?.xp ?? 0,
      currentStreak,
      longestStreak: user?.longestStreak ?? 0,
      lastCheckInDate: user?.lastCheckInDate ?? null,
      checkedInToday:
        (user?.lastCheckInDate ?? null) === today && currentStreak > 0,
    };
  }

  /**
   * Records a check-in for the whole user (not per-course) and recomputes
   * their global streak. Idempotent: repeated calls on the same date return
   * the current state without awarding XP twice. A passing lesson quiz is the
   * activity that funnels through here.
   */
  async recordDailyCheckIn(userId: string, dateOverride?: string) {
    const date = dateOverride || toDateKey(new Date());

    const existing = await this.prisma.orm.public.UserCheckIn.where({
      userId,
      date,
    }).first();

    if (!existing) {
      try {
        await this.prisma.orm.public.UserCheckIn.create({
          id: crypto.randomUUID(),
          userId,
          date,
          createdAt: new Date().toISOString(),
        });
      } catch (error) {
        const code = (error as { code?: string })?.code;
        if (code !== 'P2002' && code !== '23505') {
          throw error;
        }
      }
    }

    const all = await this.prisma.orm.public.UserCheckIn.where({
      userId,
    }).all();
    const { streak, longestStreak } = computeStreaks(
      all.map((c) => c.date),
      date,
    );

    // Only award XP the first time this date is recorded.
    let xpAwarded = 0;
    if (!existing) {
      const bonus = Math.min(20, Math.max(0, (streak - 1) * 2));
      xpAwarded = 10 + bonus;
      await this.xpService.award(userId, 'DAILY_CHECK_IN', xpAwarded);
    }

    await this.prisma.orm.public.User.where({ id: userId }).update({
      currentStreak: streak,
      longestStreak,
      lastCheckInDate: date,
      updatedAt: new Date().toISOString(),
    });

    return {
      checkedInToday: true,
      streak,
      longestStreak,
      xpAwarded,
      xp: await this.xpService.currentXp(userId),
    };
  }


  async leaderboard(userId: string, limit = 50, offset = 0) {
    const { start, end } = weekBounds(new Date());

    const competition = await this.prisma.orm.public.Competition.where({
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
    }).first();

    if (!competition) {
      return {
        competition: {
          startsAt: start.toISOString(),
          endsAt: end.toISOString(),
        },
        entries: [],
        me: null,
        total: 0,
      };
    }

    const members = await this.prisma.orm.public.CompetitionMember.where({
      competitionId: competition.id,
    })
      .include('user', (u) =>
        u.select('id', 'fullName', 'username', 'avatarUrl', 'xp'),
      )
      .orderBy((m) => m.points.desc())
      .all();

    // Standard competition ranking — ties share the same rank.
    let rank = 0;
    let prevPoints: number | null = null;
    const ranked = members.map((m, index) => {
      if (m.points !== prevPoints) {
        rank = index + 1;
        prevPoints = m.points;
      }
      const user = m.user as any;
      return {
        rank,
        points: m.points,
        tier: tierForRank(rank),
        user: {
          id: user.id,
          fullName: user.fullName,
          username: user.username,
          avatarUrl: user.avatarUrl,
          xp: user.xp,
        },
      };
    });

    const myIndex = ranked.findIndex((e) => e.user.id === userId);
    const me =
      myIndex >= 0
        ? {
            rank: ranked[myIndex].rank,
            tier: ranked[myIndex].tier,
            points: ranked[myIndex].points,
            userId,
          }
        : null;

    const safeLimit = Math.max(1, limit);
    const safeOffset = Math.max(0, offset);

    return {
      competition: {
        startsAt: competition.startsAt,
        endsAt: competition.endsAt,
      },
      entries: ranked.slice(safeOffset, safeOffset + safeLimit),
      me,
      total: ranked.length,
    };
  }
}
