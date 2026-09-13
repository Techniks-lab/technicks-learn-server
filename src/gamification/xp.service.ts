import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export type XpSource = 'DAILY_CHECK_IN' | 'LESSON_COMPLETED';

/**
 * Central XP accounting. Every award:
 *  1. writes an audit row to XpEvent,
 *  2. bumps the denormalized `user.xp` ledger,
 *  3. credits the same amount as points in the current weekly Competition.
 */
@Injectable()
export class XpService {
  constructor(private readonly prisma: PrismaService) {}

  async currentXp(userId: string): Promise<number> {
    const user = await this.prisma.orm.public.User.where({ id: userId }).first();
    return user?.xp ?? 0;
  }

  async award(userId: string, source: XpSource, amount: number): Promise<void> {
    const now = new Date().toISOString();

    await this.prisma.orm.public.XpEvent.create({
      id: crypto.randomUUID(),
      userId,
      source: source as any,
      amount,
      createdAt: now,
    });

    const user = await this.prisma.orm.public.User.where({ id: userId }).first();
    if (user) {
      await this.prisma.orm.public.User.where({ id: userId }).update({
        xp: user.xp + amount,
        updatedAt: now,
      });
    }

    await this.creditCompetitionPoints(userId, amount, now);
  }

  private async creditCompetitionPoints(
    userId: string,
    amount: number,
    now: string,
  ): Promise<void> {
    const { start, end } = weekBounds(new Date());

    let competition = await this.prisma.orm.public.Competition.where({
      startsAt: start,
      endsAt: end,
    }).first();

    if (!competition) {
      try {
        competition = await this.prisma.orm.public.Competition.create({
          id: crypto.randomUUID(),
          startsAt: start,
          endsAt: end,
          createdAt: now,
        });
      } catch (error) {
        const code = (error as { code?: string })?.code;
        if (code !== 'P2002' && code !== '23505') {
          throw error;
        }
        competition = await this.prisma.orm.public.Competition.where({
          startsAt: start,
          endsAt: end,
        }).first();
      }
    }

    if (!competition) {
      return;
    }

    const member = await this.prisma.orm.public.CompetitionMember.where({
      competitionId: competition.id,
      userId,
    }).first();

    if (member) {
      await this.prisma.orm.public.CompetitionMember.where({ id: member.id }).update({
        points: member.points + amount,
      });
    } else {
      await this.prisma.orm.public.CompetitionMember.create({
        id: crypto.randomUUID(),
        competitionId: competition.id,
        userId,
        points: amount,
        joinedAt: now,
      });
    }
  }
}

/** Monday 00:00 (local) → next Monday 00:00 (local) as ISO strings. */
function weekBounds(date: Date): { start: string; end: string } {
  const start = new Date(date);
  const day = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - day);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 7);

  return { start: start.toISOString(), end: end.toISOString() };
}