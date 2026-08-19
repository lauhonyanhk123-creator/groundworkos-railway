import type { Server } from "http";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock("@workspace/db", () => ({ db: { execute } }));

const { default: healthRouter } = await import("./health");

let server: Server;
let baseUrl: string;

beforeEach(async () => {
  execute.mockReset();
  const app = express();
  app.use(healthRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("GET /healthz", () => {
  it("returns ok without touching the database", async () => {
    const res = await fetch(`${baseUrl}/healthz`);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: "ok" });
    expect(execute).not.toHaveBeenCalled();
  });
});

describe("GET /readyz", () => {
  it("returns 200 ok when the database is reachable", async () => {
    execute.mockResolvedValue({ rows: [{ "?column?": 1 }] });

    const res = await fetch(`${baseUrl}/readyz`);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: "ok" });
  });

  it("returns 503 when the database is unreachable", async () => {
    execute.mockRejectedValue(new Error("connection refused"));

    const res = await fetch(`${baseUrl}/readyz`);

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ status: "error" });
  });
});
