import { Injectable, HttpException, HttpStatus } from '@nestjs/common';

export interface OtpRateLimitOptions {
  windowMs?: number;
  maxAttempts?: number;
  minIntervalMs?: number;
}

const DEFAULT_OPTIONS: Required<OtpRateLimitOptions> = {
  windowMs: 15 * 60 * 1000,
  maxAttempts: 3,
  minIntervalMs: 60 * 1000,
};

@Injectable()
export class OtpRateLimiter {
  private readonly buckets = new Map<string, number[]>();

  check(key: string, options: OtpRateLimitOptions = {}): void {
    const { windowMs, maxAttempts, minIntervalMs } = {
      ...DEFAULT_OPTIONS,
      ...options,
    };

    const now = Date.now();

    if (this.buckets.size > 10_000) {
      for (const [bucketKey, attempts] of this.buckets) {
        const active = attempts.filter((attempt) => now - attempt < windowMs);
        if (active.length === 0) {
          this.buckets.delete(bucketKey);
        } else {
          this.buckets.set(bucketKey, active);
        }
      }
    }

    const attempts = this.buckets.get(key) ?? [];
    const active = attempts.filter((attempt) => now - attempt < windowMs);

    if (active.length === 0) {
      this.buckets.set(key, [now]);
      return;
    }

    const lastAttemptAt = active[active.length - 1];
    if (now - lastAttemptAt < minIntervalMs) {
      const retryAfterSec = Math.ceil((minIntervalMs - (now - lastAttemptAt)) / 1000);
      throw new HttpException(`Too many requests. Retry in ${retryAfterSec}s`, HttpStatus.TOO_MANY_REQUESTS);
    }

    if (active.length >= maxAttempts) {
      const oldest = active[0];
      const retryAfterSec = Math.ceil((windowMs - (now - oldest)) / 1000);
      throw new HttpException(`Too many requests. Retry in ${retryAfterSec}s`, HttpStatus.TOO_MANY_REQUESTS);
    }

    active.push(now);
    this.buckets.set(key, active);
  }
}