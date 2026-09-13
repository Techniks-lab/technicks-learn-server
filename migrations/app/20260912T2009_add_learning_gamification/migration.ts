#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/883ec51ee70e2541928addefd6febafa9ddb62125b7cc9176dc8c4d770330acd/contract';
import startContract from '../../snapshots/883ec51ee70e2541928addefd6febafa9ddb62125b7cc9176dc8c4d770330acd/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/b2db291968a05a27508f537b3fed7e633583f7b793ee6a04e82c998592676e6f/contract';
import endContract from '../../snapshots/b2db291968a05a27508f537b3fed7e633583f7b793ee6a04e82c998592676e6f/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  lit,
  primaryKey,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'checkIn',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('date', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('userId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'competition',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('endsAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('startsAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'competitionMember',
        columns: [
          col('competitionId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('joinedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('points', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('userId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'lesson',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('description', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('slug', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('sortOrder', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('status', 'text', {
            notNull: true,
            default: lit('DRAFT'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('title', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression('lesson_status_check_1b4a7b6b', "\"status\" IN ('DRAFT', 'PUBLISHED')"),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'lessonBlock',
        columns: [
          col('blockIndex', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('caption', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('kind', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('lessonId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('text', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('url', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'lessonBlock_kind_check_710f4413',
            "\"kind\" IN ('HEADING', 'TEXT', 'IMAGE', 'VIDEO')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'lessonCompletion',
        columns: [
          col('completedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('lessonId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('userId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'xpEvent',
        columns: [
          col('amount', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('source', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('userId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'xpEvent_source_check_41c470cd',
            "\"source\" IN ('DAILY_CHECK_IN', 'LESSON_COMPLETED')",
          ),
        ],
      }),
      this.addColumn({
        schema: 'public',
        table: 'user',
        column: col('xp', 'int4', {
          notNull: true,
          default: lit(0),
          codecRef: { codecId: 'pg/int4@1' },
        }),
      }),
      this.addUnique({
        schema: 'public',
        table: 'checkIn',
        constraint: 'checkIn_userId_date_key',
        columns: ['userId', 'date'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'competition',
        constraint: 'competition_startsAt_endsAt_key',
        columns: ['startsAt', 'endsAt'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'competitionMember',
        constraint: 'competitionMember_competitionId_userId_key',
        columns: ['competitionId', 'userId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'lesson',
        constraint: 'lesson_slug_key',
        columns: ['slug'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'lessonCompletion',
        constraint: 'lessonCompletion_userId_lessonId_key',
        columns: ['userId', 'lessonId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'checkIn',
        index: 'checkIn_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'competitionMember',
        index: 'competitionMember_competitionId_idx_53fccd3b',
        columns: ['competitionId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'competitionMember',
        index: 'competitionMember_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'lesson',
        index: 'lesson_sortOrder_idx_ebf2eac2',
        columns: ['sortOrder'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'lesson',
        index: 'lesson_status_idx_e98638ab',
        columns: ['status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'lessonBlock',
        index: 'lessonBlock_lessonId_idx_e358970d',
        columns: ['lessonId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'lessonCompletion',
        index: 'lessonCompletion_lessonId_idx_e358970d',
        columns: ['lessonId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'lessonCompletion',
        index: 'lessonCompletion_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'xpEvent',
        index: 'xpEvent_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'checkIn',
        foreignKey: {
          name: 'checkIn_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'competitionMember',
        foreignKey: {
          name: 'competitionMember_competitionId_fkey',
          columns: ['competitionId'],
          references: { schema: 'public', table: 'competition', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'competitionMember',
        foreignKey: {
          name: 'competitionMember_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'lessonBlock',
        foreignKey: {
          name: 'lessonBlock_lessonId_fkey',
          columns: ['lessonId'],
          references: { schema: 'public', table: 'lesson', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'lessonCompletion',
        foreignKey: {
          name: 'lessonCompletion_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'lessonCompletion',
        foreignKey: {
          name: 'lessonCompletion_lessonId_fkey',
          columns: ['lessonId'],
          references: { schema: 'public', table: 'lesson', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'xpEvent',
        foreignKey: {
          name: 'xpEvent_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
