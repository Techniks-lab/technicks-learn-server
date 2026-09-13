# Auth Implementation

Implementation reference for all authentication and development processes.

Base URL: `http://localhost:3000` · Global prefix: `/api` · URI versioning: v1
All endpoints below are relative to `http://localhost:3000/api/v1` unless noted.

---

## 1. Email verification on registration (OTP)

### Flow

1. Client calls `POST /auth/register` with the full account data.
2. Server creates the account with `isVerified = false`, generates a 6-digit OTP,
   stores a bcrypt hash in `emailVerification`, and emails it via Brevo.
3. If the email cannot be delivered, the send **does not fail the request** — the
   error is logged, the OTP stays valid, and (in non-production) the plaintext OTP
   is returned as `devOtp` so the flow stays testable.
4. Client calls `POST /auth/verify-email` with `{ email, token }`.
5. On success the token is marked used, all other pending tokens are deleted, and
   `user.isVerified` is set to `true`.

### Endpoints

#### `POST /auth/register`

Body:

```json
{
  "email": "john@example.com",
  "password": "Password123",
  "fullName": "Jonathan Doe"
}
```
```

`201` (always returns tokens, so the app can auto-login the user; `username` is `null` until set
via the step-by-step username step):

```json
{
  "user": {
    "id": "…uuid…",
    "email": "john@example.com",
    "username": null,
    "role": "student",
    "isVerified": false
  },
  "accessToken": "…",
  "refreshToken": "…",
  "emailVerificationPending": true,
  "devOtp": "123456"
}
```

- `devOtp` is **only present** when `NODE_ENV !== 'production'` **and** the email
  failed to send.
- `409` when the email is already registered by a **verified** account.
- `429` when rate-limited.

## 1b. Step-by-step username (create / change)

Registration no longer collects a username (`user.username` starts `null`). It is set in a
later onboarding step and can be changed afterwards.

#### `POST /auth/username` (Bearer) — create or change

Body:

```json
{ "username": "johndoe" }
```

`200`:

```json
{
  "user": { "id": "…", "email": "…", "username": "johndoe", "role": "student", "isVerified": false },
  "created": true,
  "accessToken": "…",
  "refreshToken": "…"
}
```

- `created: true` when the user had no username yet; `false` when it was a change.
- Checks uniqueness (`409 Username already taken`), then rotates the refresh token so issued
  JWTs carry the new username.
- Needs no special permission — any authenticated user can set/change their own.

#### `GET /auth/username/check?username=…` (public)

`200` → `{ "available": true }` / `{ "available": false }`. Use for live availability checks in
the signup form.

#### `POST /auth/resend-otp`

Body: `{ "email": "john@example.com" }`

`200` — always returns a generic message for privacy:

```json
{ "message": "If your email is pending verification, a new OTP has been sent" }
```

Only sends when the email belongs to an **unverified** account. Rate-limited.

#### `POST /auth/verify-email`

Body:

```json
{ "email": "john@example.com", "token": "123456" }
```

- `200` → `{ "message": "Email verified successfully" }`
- `200` → `{ "message": "Email already verified" }` (idempotent re-verify)
- `400` → invalid or expired OTP

---

## 2. Duplicate signup protection ("email already exists" trap)

If a user registers but never verifies, the account with that email already exists.
Re-registering the same email would normally return `409`. To avoid trapping the
user:

- If the existing account is **unverified**, `register` **absorbs** the submission:
  the username / password / display name / full name are **updated** to the latest
  form values, a fresh OTP is issued, and a normal `201` (with
  `emailVerificationPending: true`) is returned.
- A `409` is only returned for **verified** emails (or a username taken by a
  different user).
- Accounts left **unverified for more than 24 h** are opportunistically purged on
  the next `register` call, so the database does not accumulate zombie rows.

Cross-user username conflicts are re-checked before absorbing.

---

## 3. Session & tokens

### `POST /auth/login` — `{ "email", "password" }` → `200`

```json
{
  "user": { "id": "…", "email": "…", "username": "…", "role": "…", "isVerified": true },
  "accessToken": "…",
  "refreshToken": "…"
}
```

- Rejects with `401` for wrong credentials, inactive accounts, or bad input.
- Updates `lastActiveAt`, creates a `session` row and a rotating `refreshToken` row.
- **`user.isVerified` is included here** so the frontend can show a
  "verify your email" prompt after login without an extra request.

### `POST /auth/refresh` — `{ "refreshToken" }` → `200` new `{ accessToken, refreshToken }`

The old refresh token is deleted (rotation). Invalid/expired → `401`.

### `GET /auth/profile` (Bearer) → `200` full profile

Includes `isVerified`, so a freshly loaded app can determine verification state.

### `POST /auth/change-password` (Bearer) — `{ "currentPassword", "newPassword" }` → `200`

Validates the current password, invalidates all refresh tokens.

### `POST /auth/logout` (Bearer) → `200`

Deletes the session (by access token) and all refresh tokens for the user.

---

## 4. Password reset (OTP)

1. `POST /auth/forgot-password` — `{ "email" }`. Hash is stored in `passwordReset`
   (existing pending tokens are cleared first). Always returns the generic message
   `If an account exists, an OTP has been sent`.
2. `POST /auth/reset-password` — `{ "token", "newPassword" }`. Sets the new hash,
   marks the token used, rotates refresh tokens. `400` for invalid/expired OTP.

---

## 5. Rate limiting (anti-flood)

Implemented in `src/auth/otp-rate-limiter.service.ts` (in-memory sliding window per
key). Violations return `429` with e.g.
`"Too many requests. Retry in 59s"`.

| Scope | Limit | Notes |
|---|---|---|
| `register-ip:{ip}` | 5 registrations / 15 min per IP | register only |
| `otp:{email}` | 1 per 60 s, max 3 / 15 min | shared by register (verification OTP), `resend-otp`, and `forgot-password` |

The shared `otp:{email}` bucket means a user cannot get a second OTP within 60
seconds of the first, even from a different endpoint.

---

## 6. Development / admin

### `POST /api/v1/admin/db/clear` (outside `/auth`)

Deletes all rows (refreshToken → session → passwordReset → emailVerification →
user). Returns `403` when `NODE_ENV === 'production'`. Use it between test runs.

### Per-tag OpenAPI JSON

- `GET /docs/<tag>.json` — OpenAPI spec filtered to one tag, e.g. `/docs/auth.json`.
- `GET /docs/full.json` — the complete API spec.
- Unknown prefix → `404` with the list of available prefixes.

---

## 7. Database schema (relevant tables)

- `user` — `id Uuid`, `email`, `username`, `passwordHash`,
  `fullName`, `role`, `isVerified Boolean`, `isActive Boolean`, timestamps,
  `lastActiveAt`.
- `emailVerification` — `id`, `userId` (FK, cascade), `token` (bcrypt hash),
  `expiresAt` (15 min), `usedAt`, `createdAt`.
- `passwordReset` — same shape as `emailVerification`, for password resets.
- `session` — `token`, `userId`, `ipAddress`, `userAgent`, `expiresAt`.
- `refreshToken` — `token`, `userId`, `expiresAt` (rotated).

---

## 8. Frontend consumer flow

1. On `register` success check `emailVerificationPending` — show a one-time
   "verify your email" screen and let the user submit the OTP they received.
2. `POST /auth/verify-email { email, token }` — on `400` show "invalid or expired
   OTP" and offer a resend.
3. On `login` success (and on `GET /auth/profile` when the app reloads) check
   `user.isVerified`; if `false`, show a persistent banner with a **resend** button
   (`POST /auth/resend-otp { email }`).
4. Handle `429` responses by showing the included retry message with a countdown.

---

## 9. Environment

- `BREVO_API_KEY` — Brevo SMTP API key.
- `BREVO_SENDER_EMAIL` — **plain** verified sender address (e.g.
  `technickslab@gmail.com`). The legacy `Name<email>` format is also parsed
  defensively in `brevo.service.ts`.
- `BREVO_SENDER_NAME` — display name.
- `JWT_EXPIRES_IN` / `REFRESH_TOKEN_EXPIRES_IN` — token lifetimes.

Sending is skipped (with a warning log) when the Brevo key or sender is unset, so
signup never 500s on email delivery failures.

---

## 10. Files

| File | Purpose |
|---|---|
| `src/auth/auth.service.ts` | All auth business logic (register/verify/resend/login/refresh/logout/forgot/reset/change/profile) |
| `src/auth/auth.controller.ts` | Routes + Swagger metadata |
| `src/auth/otp-rate-limiter.service.ts` | Sliding-window rate limiter |
| `src/auth/email/brevo.service.ts` | Brevo email delivery |
| `src/auth/dto/*` | Validation DTOs (register, login, verify-email, resend-otp, forgot-password, change-password) |
| `src/auth/strategies/jwt.strategy.ts` | JWT bearer auth |
| `src/admin/admin.controller.ts` | `db/clear` dev endpoint |
| `src/prisma/contract.prisma` | Prisma v8 schema (Uuid ids, timestamps) |
| `scripts/auth-smoke.mjs` | Optional runnable smoke test of all flows |

Run the smoke test while the server is up:

```bash
node scripts/auth-smoke.mjs --base http://localhost:3000 --email you@real-inbox.com
```