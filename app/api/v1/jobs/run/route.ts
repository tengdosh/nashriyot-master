import type { NextRequest } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { ok, fail, handleError } from "@/lib/api-response";
import { JOBS, JOB_NAMES, isJobName, runJob, runNightly } from "@/jobs";

/** Admin-only job catalogue (name, schedule, label). */
export async function GET() {
  try {
    await requirePermission("admin.settings");
    return ok(JOB_NAMES.map((name) => ({ name, ...JOBS[name], run: undefined })));
  } catch (e) {
    return handleError(e);
  }
}

/**
 * POST /api/v1/jobs/run?name=dead-stock-scan  — run one job now.
 * POST /api/v1/jobs/run?name=nightly          — run the whole nightly chain.
 * Admin only (spec v1 §5.4). Jobs are idempotent, so a manual re-run is safe.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("admin.settings");
    const name = req.nextUrl.searchParams.get("name");
    if (!name) return fail("VALIDATION", "name parametri majburiy", 400);

    if (name === "nightly") {
      return ok(await runNightly(user.id!));
    }
    if (!isJobName(name)) {
      return fail("VALIDATION", `Notoʻgʻri job nomi: ${name}. Mavjud: ${JOB_NAMES.join(", ")}, nightly`, 400);
    }
    return ok(await runJob(name, user.id!));
  } catch (e) {
    return handleError(e);
  }
}
