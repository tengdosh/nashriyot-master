#!/usr/bin/env node
/**
 * CI guard — two checks in one script:
 *
 * CHECK 1 (write paths): action/route files that use entityId in an auth-guarded
 * context but do not call assertRowAccess / requireRowAccess.
 *   Scans: app/**\/actions.ts, app/api/v1\/**\/route.ts
 *
 * CHECK 2 (read paths): page.tsx files that directly query entity-scoped Prisma
 * models (SalesOrder, Receivable, Payment, TransferOrder, StockMovement,
 * InventoryItem) without calling entityFilter().
 *   Scans: app\/**\/page.tsx
 *
 * Opt-out: add `// check:entity-ok: <reason>` to files where the check is a
 * known false-positive (read-only entityId, company-wide model, etc.).
 *
 * Exit 0 = all clear   Exit 1 = violations found
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const ROOT = new URL("..", import.meta.url).pathname;

function findFiles(dir, matcher) {
  const results = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      results.push(...findFiles(full, matcher));
    } else if (matcher(entry, full)) {
      results.push(full);
    }
  }
  return results;
}

// ── CHECK 1: write paths (actions.ts + route.ts) ─────────────────────────────

const writePaths = [
  ...findFiles(join(ROOT, "app"), (name) => name === "actions.ts"),
  ...findFiles(join(ROOT, "app", "api", "v1"), (name) => name === "route.ts"),
];

const violations = [];

for (const file of writePaths) {
  const src = readFileSync(file, "utf8");
  if (src.includes("// check:entity-ok")) continue;

  const hasAuthGuard = src.includes("requirePermission(");
  if (!hasAuthGuard) continue;

  const hasEntityId = /\bentityId\b/.test(src);
  if (!hasEntityId) continue;

  const hasGuard =
    src.includes("assertRowAccess(") || src.includes("requireRowAccess(");
  if (hasGuard) continue;

  violations.push(`${file.replace(ROOT, "")}  [write: entityId without assertRowAccess]`);
}

// ── CHECK 2: read paths (page.tsx) ───────────────────────────────────────────

// Models whose rows are scoped per entity — a findMany without entityFilter is a leak.
const ENTITY_SCOPED_MODELS = [
  "salesOrder",
  "receivable",
  "payment",
  "transferOrder",
  "stockMovement",
  "inventoryItem",
];

const pagePaths = findFiles(join(ROOT, "app"), (name) => name === "page.tsx");

for (const file of pagePaths) {
  const src = readFileSync(file, "utf8");
  if (src.includes("// check:entity-ok")) continue;

  const hasAuthGuard = src.includes("requirePermission(");
  if (!hasAuthGuard) continue;

  // Does this page query an entity-scoped model directly?
  const hasEntityScopedQuery = ENTITY_SCOPED_MODELS.some(
    (m) => src.includes(`prisma.${m}.findMany`) || src.includes(`prisma.${m}.findFirst`),
  );
  if (!hasEntityScopedQuery) continue;

  const hasEntityFilter = src.includes("entityFilter(");
  if (hasEntityFilter) continue;

  violations.push(`${file.replace(ROOT, "")}  [read: entity-scoped findMany without entityFilter]`);
}

// ── Report ────────────────────────────────────────────────────────────────────

if (violations.length === 0) {
  console.log("check:entity — OK: all entity-aware write and read paths are guarded");
  process.exit(0);
} else {
  console.error("check:entity — FAIL: entity isolation violations found:\n");
  for (const v of violations) {
    console.error(`  ✗  ${v}`);
  }
  console.error(
    "\nWrite paths: add assertRowAccess(user, { entityId }) before any DB mutation." +
    "\nRead paths:  add entityFilter(user) and pass to service/query, or add // check:entity-ok if company-wide.",
  );
  process.exit(1);
}
