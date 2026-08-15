import { logger } from "./logger";

/**
 * Every env var the server cannot run without. Checked together, up front,
 * so a misconfigured environment fails once with a full list instead of
 * dying on whichever var happens to be read first (mid-import, with a
 * stack trace pointing at an unrelated module).
 */
const REQUIRED_ENV_VARS = [
  "PORT",
  "DATABASE_URL",
  "S3_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
] as const;

const missing = REQUIRED_ENV_VARS.filter((name) => !process.env[name]);

if (missing.length > 0) {
  logger.error(
    `Missing required environment variable(s): ${missing.join(", ")}`,
  );
  process.exit(1);
}
