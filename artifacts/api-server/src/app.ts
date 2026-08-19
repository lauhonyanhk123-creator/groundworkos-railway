import express, {
  type Express,
  type RequestHandler,
  type ErrorRequestHandler,
} from "express";
import path from "path";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import router from "./routes";
import { logger } from "./lib/logger";
import { buildCspDirectives } from "./lib/csp";

const app: Express = express();

/**
 * The app runs behind Railway's reverse proxy, so trust the first hop's
 * X-Forwarded-For header when determining the caller's IP. This is required
 * for express-rate-limit (and req.ip generally) to key off the real client
 * address instead of the proxy's.
 */
app.set("trust proxy", 1);

/**
 * Security headers. helmet sets a restrictive Content-Security-Policy, HSTS,
 * X-Frame-Options (via frameguard), X-Content-Type-Options, and other
 * hardening headers on every response. Clerk's browser SDK loads from - and
 * calls back to - the Clerk Frontend API origin encoded in
 * CLERK_PUBLISHABLE_KEY, so buildCspDirectives adds that origin wherever
 * Clerk needs it (see src/lib/csp.ts). If the optional static SPA (see
 * STATIC_DIR below) needs additional script/style/image sources, extend the
 * directives there rather than relaxing them wholesale.
 */
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: buildCspDirectives(process.env.CLERK_PUBLISHABLE_KEY),
    },
    hsts: {
      maxAge: 15552000, // 180 days
      includeSubDomains: true,
      preload: true,
    },
  }),
);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

/**
 * When APP_URL is set (production), only that origin may make credentialed
 * cross-origin requests. Left unset (local dev), the request origin is
 * reflected so local tooling on any port keeps working.
 */
app.use(cors({ credentials: true, origin: process.env.APP_URL ?? true }));
/**
 * Body parsers, but skip routes that need their raw, unparsed body:
 * - the storage upload relay (PUT /api/storage/uploads/direct/:id) streams
 *   its body untouched to object storage — otherwise a file whose
 *   Content-Type is application/json (or form-urlencoded) would be drained
 *   here before it reaches the relay handler.
 * - the Clerk webhook (POST /api/webhooks/clerk) needs the exact original
 *   bytes to verify its svix signature (see routes/clerk_webhook.ts); it gets
 *   express.raw() below instead.
 */
const needsRawBody = (req: { method: string; path: string }): boolean =>
  (req.method === "PUT" && req.path.includes("/storage/uploads/direct/")) ||
  req.path === "/api/webhooks/clerk";

const skipRawBodyRoutes =
  (handler: RequestHandler): RequestHandler =>
  (req, res, next) => {
    if (needsRawBody(req)) {
      return next();
    }
    return handler(req, res, next);
  };

app.use(skipRawBodyRoutes(express.json()));
app.use(skipRawBodyRoutes(express.urlencoded({ extended: true })));
app.use("/api/webhooks/clerk", express.raw({ type: "application/json" }));

app.use(
  clerkMiddleware({
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
    ...(process.env.APP_URL
      ? { authorizedParties: [process.env.APP_URL] }
      : {}),
  }),
);

/**
 * Rate limiting. A generous default limit applies across the whole API;
 * the unauthenticated public routes (health check + OAuth provider
 * callbacks) get a much tighter limit since they can be hit by anyone
 * without any auth at all.
 */
const defaultApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

const publicRouteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

app.use(
  [
    "/api/healthz",
    "/api/readyz",
    "/api/xero/callback",
    "/api/quickbooks/callback",
    "/api/sage/callback",
    "/api/freeagent/callback",
    "/api/webhooks/clerk",
  ],
  publicRouteLimiter,
);

app.use("/api", defaultApiLimiter, router);

/**
 * Optional single-service static hosting - set STATIC_DIR to the built
 * frontend's output directory (e.g. artifacts/groundworkos/dist/public) to
 * have this server serve the SPA itself, alongside the API. This is what
 * makes a single-service deploy (e.g. on Railway) possible without a
 * separate reverse proxy.
 * Leave STATIC_DIR unset to keep previous behavior (API only) unchanged.
 */
const staticDir = process.env.STATIC_DIR;

if (staticDir) {
  const resolvedStaticDir = path.resolve(staticDir);

  app.use(express.static(resolvedStaticDir));

  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api")) {
      return next();
    }
    res.sendFile(path.join(resolvedStaticDir, "index.html"));
  });
}

/**
 * Final error-handling middleware. Registered last (Express identifies it as
 * an error handler by its 4-argument signature) so it catches errors from
 * every route and middleware mounted above. Logs via the request-scoped
 * pino logger attached by pino-http (falling back to the base logger) and
 * always responds with a consistent JSON error shape instead of Express's
 * default HTML error page.
 */
const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  const status =
    typeof err?.status === "number"
      ? err.status
      : typeof err?.statusCode === "number"
        ? err.statusCode
        : 500;

  (req.log ?? logger).error(
    { err, status, method: req.method, url: req.originalUrl },
    "Unhandled request error",
  );

  res.status(status).json({
    error: {
      message:
        status === 500
          ? "Internal server error"
          : (err?.message ?? "Request failed"),
      status,
    },
  });
};

app.use(errorHandler);

export default app;
