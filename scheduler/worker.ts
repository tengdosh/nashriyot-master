/**
 * Standalone job scheduler — runs as a separate process alongside the Next.js app.
 * Uses node-cron to trigger jobs at their configured "HH:MM" schedule (Asia/Tashkent tz).
 *
 * Run: npx tsx scheduler/worker.ts
 * Production: systemctl start nashriyot-scheduler
 */

import * as cron from "node-cron";
import { prisma } from "@/lib/db";
import { JOBS, runJob, type JobName } from "@/jobs/index";
import { jobLogger } from "@/lib/logger";

const SYSTEM_USER = "system";

/** Convert "HH:MM" → cron expression "0 <min> <hour> * * *" */
function toCron(schedule: string): string {
  const [hStr, mStr] = schedule.split(":");
  return `0 ${parseInt(mStr, 10)} ${parseInt(hStr, 10)} * * *`;
}

async function writeErrorNotification(job: JobName, error: unknown): Promise<void> {
  const body = error instanceof Error ? error.message : String(error);
  try {
    await prisma.notification.create({
      data: {
        type: "GENERAL",
        severity: "CRITICAL",
        title: `Scheduler xatosi: ${job}`,
        body: body.slice(0, 500),
        refType: "JobRun",
        refId: job,
      },
    });
  } catch (dbErr) {
    jobLogger.error({ job, dbErr }, "Failed to write error notification to DB");
  }
}

async function execJob(name: JobName): Promise<void> {
  const t0 = Date.now();
  jobLogger.info({ job: name }, "START");
  try {
    const result = await runJob(name, SYSTEM_USER);
    const durationMs = Date.now() - t0;
    jobLogger.info({ job: name, durationMs, result: result.result }, "DONE");
  } catch (error) {
    const durationMs = Date.now() - t0;
    jobLogger.error({ job: name, durationMs, err: error }, "ERROR");
    await writeErrorNotification(name, error);
  }
}

// Register all jobs
for (const [name, def] of Object.entries(JOBS) as [JobName, (typeof JOBS)[JobName]][]) {
  const cronExpr = toCron(def.schedule);
  cron.schedule(cronExpr, () => execJob(name), { timezone: "Asia/Tashkent" });
  jobLogger.info({ job: name, schedule: def.schedule, cron: cronExpr }, "Registered");
}

jobLogger.info({ jobCount: Object.keys(JOBS).length }, "Scheduler ready — waiting for triggers");

// Keep process alive
process.on("SIGTERM", async () => {
  jobLogger.info("SIGTERM received — shutting down scheduler");
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});
