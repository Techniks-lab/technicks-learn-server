import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { db } from './db.js';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private client: any = db;

  async onModuleInit() {}

  async onModuleDestroy() {}

  get orm(): any {
    return this.client.orm;
  }

  get sql(): any {
    return this.client.sql;
  }

  async execute(plan: any): Promise<any> {
    return this.client.runtime().execute(plan);
  }

  // The ORM's `.where(predicate).delete()` only removes a single row. Use the
  // SQL builder to delete every matching row in one statement.
  async deleteMany(
    table: any,
    predicate: (fields: any, fns: any) => any,
  ): Promise<void> {
    const plan = table.delete().where(predicate).build();
    await this.execute(plan);
  }
}
