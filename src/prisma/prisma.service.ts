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
}