/**
 * Scheduler sinov skripti — sun'iy vaqt bilan bitta job ishga tushuradi.
 * Ishlatish:
 *   npx tsx scheduler/test-run.ts [job-name]
 *   npx tsx scheduler/test-run.ts abc 2025-09-15
 */
import { prisma } from "@/lib/db";
import { JOBS, runJob, JOB_NAMES, type JobName } from "@/jobs/index";
import { jobLogger } from "@/lib/logger";

async function main() {
  const [, , jobArg, dateArg] = process.argv;

  if (!jobArg) {
    console.log("Mavjud joblar:", JOB_NAMES.join(", "));
    console.log("Ishlatish: npx tsx scheduler/test-run.ts <job> [YYYY-MM-DD]");
    return;
  }

  if (!JOB_NAMES.includes(jobArg as JobName)) {
    console.error(`Noma'lum job: ${jobArg}. Mavjudlar: ${JOB_NAMES.join(", ")}`);
    process.exit(1);
  }

  const jobName = jobArg as JobName;
  const now = dateArg ? new Date(dateArg) : new Date();

  jobLogger.info({ job: jobName, now: now.toISOString() }, "Test run starting");

  const t0 = Date.now();
  try {
    const result = await runJob(jobName, "test-user", now);
    const durationMs = Date.now() - t0;
    jobLogger.info({ job: jobName, durationMs, result: result.result }, "Test run DONE");
  } catch (error) {
    const durationMs = Date.now() - t0;
    jobLogger.error({ job: jobName, durationMs, err: error }, "Test run ERROR");
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
