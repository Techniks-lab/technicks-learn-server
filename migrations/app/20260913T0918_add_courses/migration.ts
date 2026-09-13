#!/usr/bin/env -S node
import 'dotenv/config';
import type { Contract as Start } from '../../snapshots/b2db291968a05a27508f537b3fed7e633583f7b793ee6a04e82c998592676e6f/contract';
import startContract from '../../snapshots/b2db291968a05a27508f537b3fed7e633583f7b793ee6a04e82c998592676e6f/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/f2f5eca6d836d72b08278d30b2d0fa298764f7e0ceb2303789fe08e5645636c9/contract';
import endContract from '../../snapshots/f2f5eca6d836d72b08278d30b2d0fa298764f7e0ceb2303789fe08e5645636c9/contract.json' with { type: 'json' };
import postgres from '@prisma/orm-postgres/runtime';
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  lit,
  primaryKey,
} from '@prisma/orm-postgres/migration';

const transformContract = structuredClone(endContract) as End;
for (const ns of Object.values(transformContract.storage.namespaces)) {
  if (ns.kind === 'postgres-schema') {
    ns.qualifyTable = (name: string) => `"${ns.id}"."${name}"`;
  }
}

const db = postgres<End>({
  contractJson: endContract,
  url: process.env['DATABASE_URL']!,
});

const DEFAULT_COURSE_ID = '11111111-1111-4111-8111-111111111111';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropConstraint({
        schema: 'public',
        table: 'checkIn',
        constraint: 'checkIn_userId_fkey',
        kind: 'foreignKey',
      }),
      this.dropIndex({ schema: 'public', table: 'checkIn', index: 'checkIn_userId_idx_a489d58a' }),
      this.dropConstraint({
        schema: 'public',
        table: 'checkIn',
        constraint: 'checkIn_userId_date_key',
      }),
      this.dropColumn({ schema: 'public', table: 'checkIn', column: 'userId' }),
      this.createTable({
        schema: 'public',
        table: 'course',
        columns: [
          col('coverImage', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('description', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('publishedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
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
          checkExpression('course_status_check_1b4a7b6b', "\"status\" IN ('DRAFT', 'PUBLISHED')"),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'courseEnrollment',
        columns: [
          col('courseId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('currentStreak', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('enrolledAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('lastCheckInDate', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('longestStreak', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('status', 'text', {
            notNull: true,
            default: lit('ACTIVE'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('userId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'courseEnrollment_status_check_0a2783e1',
            "\"status\" IN ('ACTIVE', 'COMPLETED')",
          ),
        ],
      }),
      this.addColumn({
        schema: 'public',
        table: 'checkIn',
        column: col('enrollmentId', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
      }),
      this.dataTransform(transformContract, 'backfill-checkIn-enrollmentId', {
        check: () =>
          db.sql.public.checkIn
            .select('id')
            .where((f, fns) => fns.eq(f.enrollmentId, null))
            .limit(1),
        run: () =>
          db.sql.public.checkIn.delete().where((f, fns) => fns.eq(f.enrollmentId, null)),
      }),
      this.setNotNull({ schema: 'public', table: 'checkIn', column: 'enrollmentId' }),
      this.addColumn({
        schema: 'public',
        table: 'lesson',
        column: col('courseId', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
      }),
      this.dataTransform(transformContract, 'backfill-lesson-courseId', {
        check: () =>
          db.sql.public.lesson
            .select('id')
            .where((f, fns) => fns.eq(f.courseId, null))
            .limit(1),
        run: [
          () =>
            db.sql.public.course.insert([
              {
                id: DEFAULT_COURSE_ID,
                slug: 'getting-started',
                title: 'Getting Started',
                description: 'Your first steps into Technicks.',
                status: 'PUBLISHED',
                sortOrder: 0,
              },
            ]),
          () =>
            db.sql.public.lesson
              .update({ courseId: DEFAULT_COURSE_ID })
              .where((f, fns) => fns.eq(f.courseId, null)),
        ],
      }),
      this.setNotNull({ schema: 'public', table: 'lesson', column: 'courseId' }),
      this.addUnique({
        schema: 'public',
        table: 'checkIn',
        constraint: 'checkIn_enrollmentId_date_key',
        columns: ['enrollmentId', 'date'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'course',
        constraint: 'course_slug_key',
        columns: ['slug'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'courseEnrollment',
        constraint: 'courseEnrollment_courseId_userId_key',
        columns: ['courseId', 'userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'checkIn',
        index: 'checkIn_enrollmentId_idx_ee5e79c5',
        columns: ['enrollmentId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'course',
        index: 'course_sortOrder_idx_ebf2eac2',
        columns: ['sortOrder'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'course',
        index: 'course_status_idx_e98638ab',
        columns: ['status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'courseEnrollment',
        index: 'courseEnrollment_courseId_idx_12f72d2a',
        columns: ['courseId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'courseEnrollment',
        index: 'courseEnrollment_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'lesson',
        index: 'lesson_courseId_idx_12f72d2a',
        columns: ['courseId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'courseEnrollment',
        foreignKey: {
          name: 'courseEnrollment_courseId_fkey',
          columns: ['courseId'],
          references: { schema: 'public', table: 'course', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'courseEnrollment',
        foreignKey: {
          name: 'courseEnrollment_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'checkIn',
        foreignKey: {
          name: 'checkIn_enrollmentId_fkey',
          columns: ['enrollmentId'],
          references: { schema: 'public', table: 'courseEnrollment', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'lesson',
        foreignKey: {
          name: 'lesson_courseId_fkey',
          columns: ['courseId'],
          references: { schema: 'public', table: 'course', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
