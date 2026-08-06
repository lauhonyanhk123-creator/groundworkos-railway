import express, { type Express, type RequestHandler } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

/**
 * Standalone (external) Clerk mode — set CLERK_STANDALONE=true when running off
 * Replit against your own Clerk account. In this mode we skip the Replit Clerk
 * proxy and use the publishable key directly. (publishableKeyFromHost rebuilds
 * the FAPI host from the request hostname for a live key, which is correct only
 * for Replit's proxied multi-domain setup.) When the flag is unset, behavior is
 * exactly as before.
 */
const clerkStandalone = process.env.CLERK_STANDALONE === "true";

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

if (!clerkStandalone) {
  app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
}

/**
* When APP_URL is set (production self-host), only that origin may make
* credentialed cross-origin requests. Left unset (local dev), the request
* origin is reflected so local tooling on any port keeps working.
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
  clerkMiddleware(
    clerkStandalone
      ? {
          publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
          ...(process.env.APP_URL ? { authorizedParties: [process.env.APP_URL] } : {}),
        }
      : (req) => ({
          publishableKey: publishableKeyFromHost(
            getClerkProxyHost(req) ?? "",
            process.env.CLERK_PUBLISHABLE_KEY,
          ),
        }),
  ),
);

app.use("/api", router);

export default app;
