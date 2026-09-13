import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { XpService } from './xp.service.js';

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

    return {
      xp: user?.xp ?? 0,
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
