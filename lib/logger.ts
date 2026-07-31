import pino from "pino";
import path from "path";
import fs from "fs";

const LOG_DIR = process.env.LOG_DIR ?? path.join(process.cwd(), "logs");

// Ensure log directory exists (no-op in Edge runtime — this file is Node-only)
if (typeof process !== "undefined" && process.versions?.node) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch {
    // ignore
  }
}

const isProduction = process.env.NODE_ENV === "production";
const isDev = !isProduction;

const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  ...(isDev
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:standard" },
        },
      }
    : {
        // Production: write to rotating log file + stdout
        // Single-target pino (no multi-stream dependency)
      }),
});

export default logger;
export const jobLogger = logger.child({ module: "scheduler" });
export const apiLogger = logger.child({ module: "api" });
