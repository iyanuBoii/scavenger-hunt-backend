import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 5;

/**
 * Simple in-memory sliding-window rate limiter for the error-report
 * submission endpoint, keyed by authenticated user ID (falls back to IP
 * for unauthenticated requests). No external dependency required.
 */
@Injectable()
export class ErrorReportRateLimitGuard implements CanActivate {
  private readonly hits = new Map<string, number[]>();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const key = request.user?.id ?? request.ip ?? 'anonymous';
    const now = Date.now();

    const windowStart = now - WINDOW_MS;
    const timestamps = (this.hits.get(key) ?? []).filter((t) => t > windowStart);

    if (timestamps.length >= MAX_REQUESTS_PER_WINDOW) {
      throw new HttpException(
        'Too many error reports submitted. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    timestamps.push(now);
    this.hits.set(key, timestamps);

    return true;
  }
}
