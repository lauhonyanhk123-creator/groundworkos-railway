import rateLimit from "express-rate-limit";
import type { RequestHandler } from "express";

/**
 * Paths that liveness/readiness probes hit. These are the paths Railway's
 * healthcheck (see railway.json -> deploy.healthcheckPath) and any external
 * uptime monitor poll, so they must never be rate limited into failure.
 */
export const HEALTH_CHECK_PATHS = ["/api/healthz", "/api/readyz"] as const;

/**
 * Unauthenticated routes that are a genuine abuse surface: the OAuth provider
 * callbacks and the Clerk webhook. Anyone can hit these without any auth, and
 * a legitimate caller only ever hits them a handful of times, so they keep a
 * deliberately tight limit.
 */
export const PUBLIC_ROUTE_PATHS = [
  "/api/xero/callback",
  "/api/quickbooks/callback",
  "/api/sage/callback",
  "/api/freeagent/callback",
  "/api/webhooks/clerk",
] as const;

const FIFTEEN_MINUTES = 15 * 60 * 1000;

/** Path of the current request, independent of where the limiter is mounted. */
const requestPath = (req: { originalUrl: string }): string =>
  req.originalUrl.split("?")[0];

const isHealthCheckPath = (req: { originalUrl: string }): boolean =>
  (HEALTH_CHECK_PATHS as readonly string[]).includes(requestPath(req));

/**
 * Generous default limit across the whole API for authenticated traffic.
 *
 * Health checks are skipped here: they get their own, much higher limit
 * below. Without this skip the 300/15min default would still cap probe
 * traffic at ~0.33 req/s, which a 1-second uptime poll exhausts in five
 * minutes.
 */
export const createDefaultApiLimiter = (): RequestHandler =>
  rateLimit({
    windowMs: FIFTEEN_MINUTES,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
    skip: isHealthCheckPath,
  });

/**
 * Health/readiness probes.
 *
 * 3000 requests per 15 minutes is ~3.3 req/s sustained from a single IP.
 * Sizing rationale:
 *   - a 1-second uptime poll costs 900 requests per window;
 *   - Railway's deploy healthcheck retries /api/readyz repeatedly for up to
 *     healthcheckTimeout (300s) while a cold Postgres warms up;
 *   - several probes can share one egress IP (NAT'd monitoring vendors, or
 *     Railway's own prober), so the budget has to cover more than one poller.
 * 3000 leaves ~3x headroom over the worst realistic legitimate case while
 * still capping any single IP: /api/readyz issues a `SELECT 1`, so an
 * unbounded route would be a cheap way to push load onto the database.
 */
export const createHealthCheckLimiter = (): RequestHandler =>
  rateLimit({
    windowMs: FIFTEEN_MINUTES,
    limit: 3000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later." },
  });

/** Tight limit for the unauthenticated OAuth callbacks and Clerk webhook. */
export const createPublicRouteLimiter = (): RequestHandler =>
  rateLimit({
    windowMs: FIFTEEN_MINUTES,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later." },
  });
