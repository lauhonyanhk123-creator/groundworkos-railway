import express, { type Express, type RequestHandler } from "express";
import path from "path";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

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
 * Body parsers, but skip the storage upload relay (PUT
 * /api/storage/uploads/direct/:id) so its raw body streams untouched to object
 * storage — otherwise a file whose Content-Type is application/json (or
 * form-urlencoded) would be drained here before it reaches the relay handler.
 */
const skipUploadRelay = (handler: RequestHandler): RequestHandler => (req, res, next) => {
    if (req.method === "PUT" && req.path.includes("/storage/uploads/direct/")) {
          return next();
    }
    return handler(req, res, next);
};

app.use(skipUploadRelay(express.json()));
app.use(skipUploadRelay(express.urlencoded({ extended: true })));

app.use(
    clerkMiddleware({
          publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
          ...(process.env.APP_URL ? { authorizedParties: [process.env.APP_URL] } : {}),
    }),
  );

app.use("/api", router);

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

export default app;
