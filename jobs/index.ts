import { scanDeadStock } from "@/lib/services/dead-stock-service";
import { recalcAbc, runRopMonitor } from "@/lib/services/reorder-service";

/**
 * Job registry (spec v1 §6.2–6.3). Every job is a plain async function so it can
 * be run by a scheduler, by `POST /api/v1/jobs/run`, or directly from a test.
 *
 * Nightly order matters: ABC first (it sets the service level each SKU's ROP is
 * computed at), then the ROP monitor, then the dead-stock scan.
 */
export type JobName = "abc" | "rop-monitor" | "dead-stock-scan";

export type JobResult = { job: JobName; startedAt: Date; finishedAt: Date; result: unknown };

type JobFn = (userId: string, now?: Date) => Promise<unknown>;

export const JOBS: Record<JobName, { schedule: string; label: string; run: JobFn }> = {
  abc: {
    schedule: "03:00",
    label: "ABC tasnifi (kumulyativ 80/15/5)",
    run: (userId, now) => recalcAbc({ userId, now }),
  },
  "rop-monitor": {
    schedule: "03:00",
    label: "Qayta buyurtma nuqtasi monitori",
    run: (userId, now) => runRopMonitor({ userId, now }),
  },
  "dead-stock-scan": {
    schedule: "02:00",
    label: "Oʻlik zaxira skaneri",
    run: (userId, now) => scanDeadStock({ userId, now }),
  },
};

export const JOB_NAMES = Object.keys(JOBS) as JobName[];

export function isJobName(name: string): name is JobName {
  return (JOB_NAMES as string[]).includes(name);
}

export async function runJob(name: JobName, userId: string, now?: Date): Promise<JobResult> {
  const startedAt = new Date();
  const result = await JOBS[name].run(userId, now);
  return { job: name, startedAt, finishedAt: new Date(), result };
}

/** The full nightly chain, in dependency order. */
export async function runNightly(userId: string, now?: Date): Promise<JobResult[]> {
  const order: JobName[] = ["abc", "rop-monitor", "dead-stock-scan"];
  const results: JobResult[] = [];
  for (const name of order) {
    results.push(await runJob(name, userId, now));
  }
  return results;
}
