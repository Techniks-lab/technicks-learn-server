#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/651b69564d27486cb179485e39f32ababff87c235e690966c7d124e5c86e7512/contract';
import endContract from '../../snapshots/651b69564d27486cb179485e39f32ababff87c235e690966c7d124e5c86e7512/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/71c64802b842a72f780922de188474fd1368be2a4587f5eac215b767981b418b/contract';
import startContract from '../../snapshots/71c64802b842a72f780922de188474fd1368be2a4587f5eac215b767981b418b/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropTable({ schema: 'public', table: 'checkIn' }),
      this.dropColumn({ schema: 'public', table: 'courseEnrollment', column: 'currentStreak' }),
      this.dropColumn({ schema: 'public', table: 'courseEnrollment', column: 'lastCheckInDate' }),
      this.dropColumn({ schema: 'public', table: 'courseEnrollment', column: 'longestStreak' }),
      this.dropCheckConstraint({
        schema: 'public',
        table: 'lessonBlock',
        constraint: 'lessonBlock_kind_check_710f4413',
      }),
      this.createTable({
        schema: 'public',
        table: 'lessonQuizAnswer',
        columns: [
          col('answeredAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('attemptId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('correctIndex', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('isCorrect', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('questionIndex', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('selectedIndex', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'lessonQuizAttempt',
        columns: [
          col('answeredAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('lessonId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('passed', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('score', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('total', 'int4', {
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
        table: 'userCheckIn',
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
      this.addColumn({
        schema: 'public',
        table: 'lessonBlock',
        column: col('data', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'user',
        column: col('currentStreak', 'int4', {
          notNull: true,
          default: lit(0),
          codecRef: { codecId: 'pg/int4@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'user',
        column: col('lastCheckInDate', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'user',
        column: col('longestStreak', 'int4', {
          notNull: true,
          default: lit(0),
          codecRef: { codecId: 'pg/int4@1' },
        }),
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'lessonBlock',
        constraint: 'lessonBlock_kind_check_c40bb5bc',
        expression: "\"kind\" IN ('HEADING', 'TEXT', 'IMAGE', 'VIDEO', 'QUIZ')",
      }),
      this.addUnique({
        schema: 'public',
        table: 'userCheckIn',
        constraint: 'userCheckIn_userId_date_key',
        columns: ['userId', 'date'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'lessonQuizAnswer',
        index: 'lessonQuizAnswer_attemptId_idx_94f50eb9',
        columns: ['attemptId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'lessonQuizAnswer',
        index: 'lessonQuizAnswer_questionIndex_idx_62f8021b',
        columns: ['questionIndex'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'lessonQuizAttempt',
        index: 'lessonQuizAttempt_lessonId_idx_e358970d',
        columns: ['lessonId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'lessonQuizAttempt',
        index: 'lessonQuizAttempt_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'lessonQuizAttempt',
        index: 'lessonQuizAttempt_userId_lessonId_idx_6c7e8579',
        columns: ['userId', 'lessonId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'userCheckIn',
        index: 'userCheckIn_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'lessonQuizAnswer',
        foreignKey: {
          name: 'lessonQuizAnswer_attemptId_fkey',
          columns: ['attemptId'],
          references: { schema: 'public', table: 'lessonQuizAttempt', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'lessonQuizAttempt',
        foreignKey: {
          name: 'lessonQuizAttempt_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'lessonQuizAttempt',
        foreignKey: {
          name: 'lessonQuizAttempt_lessonId_fkey',
          columns: ['lessonId'],
          references: { schema: 'public', table: 'lesson', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'userCheckIn',
        foreignKey: {
          name: 'userCheckIn_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
