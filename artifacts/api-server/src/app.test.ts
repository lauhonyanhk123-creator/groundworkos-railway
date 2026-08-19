import type { Server } from "http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock("@workspace/db", () => ({ db: { execute } }));

vi.mock("@clerk/express", () => ({
  clerkMiddleware:
    () =>
    (_req: unknown, _res: unknown, next: (err?: unknown) => void): void => {
      next();
    },
  getAuth: () => ({ userId: null }),
}));

/**
 * app.ts pulls in the whole router, and the storage routes construct their
 * S3 backend at import time. These placeholders only need to be non-empty:
 * no test here touches object storage.
 */
process.env["S3_BUCKET"] ??= "test-bucket";
process.env["S3_ACCESS_KEY_ID"] ??= "test-access-key-id";
process.env["S3_SECRET_ACCESS_KEY"] ??= "test-secret-access-key";

const { default: app } = await import("./app");

let server: Server;
let baseUrl: string;

/**
 * The public route limiter allows 30 requests per 15 minute window, so
 * anything above 30 is enough to prove whether a route sits inside it.
 */
const OVER_PUBLIC_LIMIT = 40;

beforeAll(async () => {
  execute.mockResolvedValue({ rows: [{ "?column?": 1 }] });
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("health check rate limiting", () => {
  it("does not rate limit /api/healthz past the public route limit", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < OVER_PUBLIC_LIMIT; i += 1) {
      const res = await fetch(`${baseUrl}/api/healthz`);
      statuses.push(res.status);
    }

    expect(statuses).not.toContain(429);
    expect(new Set(statuses)).toEqual(new Set([200]));
  });

  it("does not rate limit /api/readyz past the public route limit", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < OVER_PUBLIC_LIMIT; i += 1) {
      const res = await fetch(`${baseUrl}/api/readyz`);
      statuses.push(res.status);
    }

    expect(statuses).not.toContain(429);
    expect(new Set(statuses)).toEqual(new Set([200]));
  });

  it("still rate limits the OAuth callbacks at 30 per window", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 31; i += 1) {
      const res = await fetch(`${baseUrl}/api/xero/callback`);
      statuses.push(res.status);
    }

    expect(statuses.slice(0, 30)).not.toContain(429);
    expect(statuses[30]).toBe(429);
  });
});
