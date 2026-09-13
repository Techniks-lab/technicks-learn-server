# Prisma v8 RC Setup Guide

This document explains the complete setup process for Prisma v8 RC (Prisma Next) in this NestJS project.

## Overview

Prisma v8 RC introduces a new workflow called "Prisma Next" that differs significantly from Prisma v5/v6:

- **Contracts** replace `schema.prisma` as the data model definition
- **`prisma contract`** commands replace `prisma generate`
- **`prisma db`** commands replace `prisma migrate`
- **`@prisma/orm-postgres`** is the new runtime package (replaces `@prisma/client`)

## Step 1: Install Dependencies

```bash
yarn add prisma@next @prisma/client @prisma/orm-postgres dotenv
```

**Packages installed:**

| Package | Purpose |
|---------|---------|
| `prisma` (v8.0.0-rc.13) | CLI tool for schema management, migrations, and contract emission |
| `@prisma/client` (v7.10.0) | Legacy client (kept for compatibility) |
| `@prisma/orm-postgres` (v8.0.0-rc.8) | New ORM runtime for PostgreSQL |
| `dotenv` | Load environment variables from `.env` |

## Step 2: Initialize Prisma

Run the interactive init command:

```bash
npx prisma orm init --target postgres --authoring psl
```

**Options used:**
- `--target postgres`: Specifies PostgreSQL as the database
- `--authoring psl`: Uses Prisma Schema Language (PSL) instead of TypeScript for the contract

**This command creates:**

| File | Purpose |
|------|---------|
| `src/prisma/contract.prisma` | Data model definition (replaces `prisma/schema.prisma`) |
| `src/prisma/db.ts` | Database client instance for queries |
| `prisma.config.ts` | Prisma CLI configuration |
| `.env.example` | Template for environment variables |
| `prisma-next.md` | Quick reference guide |

## Step 3: Configure Environment Variables

Edit `.env` to add your PostgreSQL connection string:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/your_database?schema=public"
```

## Step 4: Emit the Contract

The contract emission process generates TypeScript types and JSON metadata from your `.prisma` schema:

```bash
npx prisma contract emit
```

**This generates:**

| File | Purpose |
|------|---------|
| `src/prisma/contract.json` | Canonical contract structure (JSON) |
| `src/prisma/contract.d.ts` | TypeScript type definitions for type-safe queries |

**When to re-run:** After any changes to `contract.prisma`

## Step 5: Initialize Database

Bootstrap your database to match the contract:

```bash
npx prisma db init
```

This creates the database schema and signs it with your contract.

## Project Structure

```
technicks-learn-server/
├── prisma.config.ts          # Prisma CLI configuration
├── .env                      # Environment variables (DATABASE_URL)
├── src/
│   └── prisma/
│       ├── contract.prisma   # Data model definition
│       ├── contract.json     # Generated: contract metadata
│       ├── contract.d.ts     # Generated: TypeScript types
│       └── db.ts             # Database client instance
└── package.json
```

## File Details

### `prisma.config.ts`

```typescript
import 'dotenv/config';
import { definePrismaConfig } from '@prisma/cli-engine';
import { defineConfig as ormConfig } from '@prisma/orm-postgres/config';

export default definePrismaConfig({
  orm: ormConfig({
    contract: "./src/prisma/contract.prisma",
    db: {
      connection: process.env['DATABASE_URL']!,
    },
  }),
});
```

### `src/prisma/contract.prisma`

The schema uses Prisma v8 RC syntax. Current models (auth + blog — the learning-center models come later):

- **User** - User accounts (email, username, hashed password, role, verification/active flags)
- **Session** - Login sessions (token, IP, user agent, expiry)
- **RefreshToken** - Rotating JWT refresh tokens
- **PasswordReset** - OTP-based password reset tokens
- **EmailVerification** - OTP-based email verification tokens
- **BlogPost** - Blog articles (title, unique slug, markdown body, cover image, DRAFT/PUBLISHED/ARCHIVED status)
- **BlogCategory** - Blog categories (name, unique slug); M:N to posts via `BlogPostCategory`
- **BlogPostCategory** - Join table linking posts and categories (`@@unique([postId, categoryId])`)
- **BlogComment** - Comments with threaded replies (`parentId` self-relation) and `onDelete: Cascade`
- **BlogPostLike** - Post reactions (`@@unique([postId, userId])` makes one like per user per post)

All primary keys and foreign keys are native UUID columns (`Uuid @id @default(uuid())`), and every timestamp column uses `TimestamptzString` (see [Syntax Differences](#prisma-v8-rc-syntax-differences)).

See `src/prisma/contract.prisma` for the full schema definition.

### `src/prisma/db.ts`

```typescript
import 'dotenv/config';
import postgres from '@prisma/orm-postgres/runtime';
import type { Contract } from './contract.d.ts';
import contractJson from './contract.json' with { type: 'json' };

export const db = postgres<Contract>({
  contractJson,
  url: process.env['DATABASE_URL']!,
});
```

### `src/prisma/prisma.service.ts`

`PrismaService` wraps the raw `db` client so NestJS services don't import it directly. It exposes the ORM lane:

```typescript
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { db } from './db.js';

@Injectable()
export class PrismaService implements OnModuleDestroy {
  private client: any = db;

  async onModuleDestroy() {}

  get orm(): any {
    return this.client.orm;
  }

  get sql(): any {
    return this.client.sql;
  }
}
```

> The previous `query` / `mutation` getters (Prisma v5/v6 style) were removed — they do not exist on the v8 client.

## Common Commands

| Command | Description |
|---------|-------------|
| `npx prisma contract emit` | Generate types from contract.prisma |
| `npx prisma contract format` | Format contract.prisma |
| `npx prisma db init` | Initialize database schema |
| `npx prisma db update` | Update database to match contract |
| `npx prisma db migrate` | Apply planned migrations |
| `npx prisma db verify` | Check database matches contract |
| `npx prisma db schema` | Inspect live database schema |
| `npx prisma migration plan` | Plan a migration from contract changes |
| `npx prisma migration list` | List on-disk migrations |

## Usage in NestJS

### Query API (important!)

Prisma v8 RC does **NOT** have `db.query.User.findMany()` or `db.mutation.User.create()`.
The correct API is **`db.orm.<namespace>.<Model>`** (colonless dotted path; the namespace for
this contract is `public`). Inject `PrismaService` and reach the ORM through `this.prisma.orm`:

```typescript
import { Injectable } from '@nestjs/common';
import { or, and } from '@prisma/orm-postgres/orm-client';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // Find one by equality (shorthand object form)
  async findByEmail(email: string) {
    return this.prisma.orm.public.User.where({ email }).first(); // row | null
  }

  // That is the same as this lambda form
  async findByEmail2(email: string) {
    return this.prisma.orm.public.User.where((u) => u.email.eq(email)).first();
  }

  // OR of two conditions
  async findByEmailOrUsername(email: string, username: string) {
    return this.prisma.orm.public.User.where((u) =>
      or(u.email.eq(email), u.username.eq(username)),
    ).first();
  }

  // AND with a range predicate (ISO timestamp strings!)
  async findValidRefreshToken(token: string) {
    return this.prisma.orm.public.RefreshToken.where((t) =>
      and(t.token.eq(token), t.expiresAt.gt(new Date().toISOString())),
    ).first();
  }

  // Create — pass model fields directly (no `data:` wrapper)
  async create(values: { email: string; username: string; passwordHash: string }) {
    return this.prisma.orm.public.User.create(values); // returns the created row
  }

  // Update — must scope with .where(...) first, pass fields directly
  async touch(id: string) {
    return this.prisma.orm.public.User.where({ id }).update({
      lastActiveAt: new Date().toISOString(),
    });
  }

  // Update many / delete all matching — .deleteAll()
  async clearSessions(userId: string) {
    await this.prisma.orm.public.Session.where({ userId }).deleteAll();
  }

  // Many rows
  async all() {
    return this.prisma.orm.public.User.all().toArray();
  }
}
```

Key rules:

- **No `query` / `mutation` namespaces.** Use `db.orm.public.<Model>` for everything.
- **Mutations take fields directly** — `create({ email })`, never `create({ data: { email } })`.
- **`update()` / `delete()` / `deleteAll()` require a `.where(...)` scope first.**
- **`update()`/`delete()` singular** are specific-row variants; `deleteAll()` deletes every match.
- **Comparisons** like `expiresAt > now` are written with field operators (`t.expiresAt.gt(...)`),
  combined with `and(...)` / `or(...)` imported from `@prisma/orm-postgres/orm-client`.
- **`eq(null)` / `isNull()`** express `IS NULL`; shorthand `{ usedAt: null }` also works.
- **Include every NOT NULL foreign key in `create()`** — e.g. `Session.create` must pass `userId`
  or the insert fails with `null value in column "userId" violates not-null constraint`.

## Troubleshooting

### TypeScript Errors in `db.ts` or `prisma.config.ts`

1. Ensure `contract.json` and `contract.d.ts` exist by running:
   ```bash
   npx prisma contract emit
   ```

2. If type errors persist, verify your `tsconfig.json` uses `nodenext` module resolution.
   The v8 packages are ESM-only, so the project must run as ESM and relative imports in `src/`
   carry explicit `.js` extensions:
   ```json
   {
     "compilerOptions": {
       "module": "nodenext",
       "moduleResolution": "nodenext",
       "resolvePackageJsonExports": true
     }
   }
   ```
   Without this you hit `ERR_MODULE_NOT_FOUND dist\src\app.module` at runtime and
   `Cannot find module` at compile time.

### Missing Jest Types

If you see errors like `Cannot find name 'describe'`, add `"jest"` to the `types` array in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "types": ["node", "jest"]
  }
}
```

### Contract Not Found Errors

Always run `npx prisma contract emit` after:
- Modifying `contract.prisma`
- Fresh clone of the repository
- Running `yarn install`

## Migration from Prisma v5/v6

If migrating from an older Prisma version:

1. **Schema location**: Move from `prisma/schema.prisma` to `src/prisma/contract.prisma`
2. **Generate command**: Replace `prisma generate` with `prisma contract emit`
3. **Migration commands**: Replace `prisma migrate` with `prisma db` commands
4. **Client import**: Replace `@prisma/client` with `@prisma/orm-postgres/runtime`
5. **Query syntax**: v8 uses `db.orm.<namespace>.<Model>` (e.g. `db.orm.public.User`) — **not**
   `db.query.Model.findMany()` / `db.mutation.Model.create()`, which do not exist
6. **IDs**: `cuid()` → native `Uuid @id @default(uuid())`; `Int @id @default(autoincrement())` only if you genuinely want serial keys
7. **Timestamps**: `DateTime` → `TimestamptzString` (Temporal codec crash — see [Timestamps](#timestamps))

## References

- [Prisma v8 Documentation](https://docs.prisma.io/docs/orm/v8)
- [Prisma Next Migration Guide](https://docs.prisma.io/docs/orm/v8/more/upgrade-guides/upgrading-to-prisma-next)

## Prisma v8 RC Syntax Differences

Prisma v8 RC (Prisma Next) has different syntax than Prisma v5/v6:

### ID Fields

All IDs are native PostgreSQL UUID columns — `Uuid` is a first-class type keyword in v8 RC
(the legacy `@db.Uuid` attribute is removed):

```prisma
// Prisma v5/v6
id String @id @default(cuid())

// Prisma v8 RC — native uuid column, uuidv4 default
id Uuid @id @default(uuid())

// The old @db.Uuid spelling is gone:
//   String @db.Uuid          ❌ PSL_UNSUPPORTED_NAMED_TYPE_ATTRIBUTE
//   Uuid                     ✅ "use Uuid in type position"
```

Foreign keys that reference a `Uuid` primary key must also be `Uuid`.

### Timestamps

Every timestamp column uses `TimestamptzString` — **not** `DateTime`:

```prisma
// Prisma v8 RC — required
createdAt TimestamptzString @default(now())
updatedAt TimestamptzString @default(now())
expiresAt TimestamptzString
usedAt    TimestamptzString?
```

> **Why not `DateTime`?** In this runtime, `DateTime` maps to the Temporal-backed codec
> `pg/timestamptz-temporal@1`, which requires the global Temporal API. Node does not provide it,
> so **any read/write of a `DateTime` column throws**
> `RUNTIME.TEMPORAL_UNAVAILABLE: Temporal-backed codecs read and write their values through the global Temporal API`.
> The `*String` variants (`TimestamptzString`, `TimestampString`, `DateString`, `TimeString`) decode/encode
> PostgreSQL's own text form and work everywhere the codecs map to the *same* storage type
> (`timestamptz`), so switching codec does not change the column type — only the application value (ISO string).

In application code, pass **ISO strings**, not `Date` objects:

```typescript
// ❌ expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
// ✅ expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
```

### Unique Fields

`@unique` attribute is supported in both versions.

### Relations

Relations work similarly but must use the same ID type on both sides:

```prisma
// Prisma v8 RC — FK type must match the PK's Uuid type
model Session {
  id     Uuid   @id @default(uuid())
  userId Uuid
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

An `onDelete: Cascade` matching an int/uuid FK mismatch (e.g. `userId Int` vs `id Uuid`) is
caught at emit time — keep FK and referenced PK types identical.

### Query Syntax

```typescript
// Prisma v5/v6
const users = await prisma.user.findMany();

// Prisma v8 RC — ORM lane, namespace-qualified
const users = await db.orm.public.User.all().toArray();
```

See [Usage in NestJS](#usage-in-nestjs) for the full API reference.

## Schema Change Workflow (v7 vs v8)

In Prisma v5/v6/v7 the loop after editing `schema.prisma` is **`prisma migrate` → `prisma generate`**.
In Prisma v8 (Prisma Next) there is no separate "migrate + generate" — the contract and the
database are both driven off the same `contract.prisma`:

| v5/v6/v7                                                              | v8 (this project)                                            |
|------------------------------------------------------------------------|---------------------------------------------------------------|
| edit `prisma/schema.prisma`                                            | edit `src/prisma/contract.prisma`                             |
| `prisma migrate dev` / `prisma migrate deploy`                         | `npx prisma migration plan` (preview on-disk migration)       |
| —                                                                      | apply: `npx prisma db init` **or** manual SQL (destructive)   |
| `prisma generate`                                                      | `npx prisma contract emit`                                    |

There is **no client generation step** — the app imports the emitted artifacts
(`src/prisma/contract.json` + `contract.d.ts`) directly; `db init` re-signs the database at the
contract's `storageHash` when the emitted contract matches the live schema.

### The daily loop

1. **Edit `contract.prisma`** (add/remove a column, model, relation, type, …).
2. **`npx prisma contract emit`** — regenerates `contract.json` / `contract.d.ts` and computes the
   new contract storage hash. Always the first command after an edit.
3. **`npx prisma migration plan`** — previews exactly which operations the change needs and flags
   them `additive` or `destructive`. It also writes an on-disk migration under `migrations/`.
4. **Apply the delta**:
   - `additive` operations (new column/table/index/FK) → `npx prisma db init` applies them and
     signs the database at the new hash. Existing data is preserved.
   - `destructive` operations (drop column/table, type change) → `db init` **refuses** unless the
     database already matches; on a dev DB apply the SQL manually and then re-sign with `db init`
     (0 planned ops). See [Handling Destructive Schema Changes](#handling-destructive-schema-changes-dev).
5. If nested code still references removed fields, update the TypeScript/DTOs before building —
   the emitted `contract.d.ts` is the source of truth for compile-time field names.

### Worked example — dropping `displayName` (done this way in this repo)

```bash
# 1. edit contract.prisma — remove the displayName line from model User

# 2. regenerate the contract
npx prisma contract emit        # new storageHash printed (e.g. f8977ac4…)

# 3. preview
npx prisma migration plan       # -> dropColumn.user.displayName  (class: destructive)

# 4a. destructive + data is disposable -> drop the column directly (keeps other rows)
#     (pg 8.x, Neon: ssl rejectUnauthorized false — the sslmode warning is harmless)
node .tmp-drop-col.mjs          # ALTER TABLE "public"."user" DROP COLUMN IF EXISTS "displayName"

# 4b. re-sign with no remaining delta
npx prisma db init              # "Applied 0 operation(s) … database signed"
```

Then remove any `migrations/` dir the plan wrote if you applied manually, delete the temp drop
script, update the code/DTOs that referenced the dropped field, and rebuild.

### Hash/signing mental model

- `contract emit` prints a `storageHash` (structural schema), `executionHash` (runtime behavior),
  and `profileHash`. Only storage changes trigger DB work.
- `db init` signs the database (writes the storage hash marker) only after the live schema matches
  the emitted contract. `prisma db verify` / `prisma migration status` confirm the space is signed
  at the intended hash.

## Handling Destructive Schema Changes (dev)

PostgreSQL cannot auto-cast `int` → `uuid` (or similar type changes), so the migration framework
classifies them as **destructive** and refuses `db init` / additive planning:

```
MIGRATION.PLANNING_FAILED — Operation "Alter type of "user"."id" to uuid" requires
class "destructive", but policy allows only: additive
```

`migration plan` will instead scaffold a package with `dataTransform` + `placeholder(...)` sentinels
that you must hand-author and self-emit (`node migrations/app/<dir>/migration.ts`).

**On an empty dev database the simplest path is to drop the tables and re-initialize:**

1. Kill any running server (it holds connections).
2. Drop the tables (PostgreSQL table names are the camelCase storage names from `contract.json` —
   `"public"."user"`, `"public"."session"`, `"public"."refreshToken"`, `"public"."passwordReset"`):
   ```sql
   DROP TABLE IF EXISTS "public"."passwordReset", "public"."refreshToken", "public"."session", "public"."user" CASCADE;
   ```
   Verify the tables are actually gone before continuing — `DROP ... IF EXISTS` with the wrong table
   name silently matches nothing.
3. Remove any unapplied `migrations/` directory that the failed plan wrote.
4. Re-run `npx prisma contract emit` (already current) and `npx prisma db init`. It introspects the
   (now empty) schema, plans pure `CREATE TABLE`/constraint/index operations (additive), applies them,
   and signs the database at the new contract hash.

> Only do this while the tables are empty — a destructive reset on a database with data will lose it.