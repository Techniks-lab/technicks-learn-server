#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/71c64802b842a72f780922de188474fd1368be2a4587f5eac215b767981b418b/contract';
import endContract from '../../snapshots/71c64802b842a72f780922de188474fd1368be2a4587f5eac215b767981b418b/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/f2f5eca6d836d72b08278d30b2d0fa298764f7e0ceb2303789fe08e5645636c9/contract';
import startContract from '../../snapshots/f2f5eca6d836d72b08278d30b2d0fa298764f7e0ceb2303789fe08e5645636c9/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'courseCategory',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('slug', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addColumn({
        schema: 'public',
        table: 'course',
        column: col('categoryId', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
      }),
      this.addUnique({
        schema: 'public',
        table: 'courseCategory',
        constraint: 'courseCategory_name_key',
        columns: ['name'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'courseCategory',
        constraint: 'courseCategory_slug_key',
        columns: ['slug'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'course',
        index: 'course_categoryId_idx_15c304f2',
        columns: ['categoryId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'courseCategory',
        index: 'courseCategory_name_idx_ce87e6ba',
        columns: ['name'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'course',
        foreignKey: {
          name: 'course_categoryId_fkey',
          columns: ['categoryId'],
          references: { schema: 'public', table: 'courseCategory', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
