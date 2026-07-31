#!/usr/bin/env node
/**
 * CI guard: flag action/route files that use entityId in an auth-guarded context
 * but do not call assertRowAccess or requireRowAccess.
 *
 * Scans:
 *   app/**\/actions.ts   — Server Action files
 *   app/api/v1\/**\/route.ts — REST API route files
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

const targets = [
  ...findFiles(join(ROOT, "app"), (name) => name === "actions.ts"),
  ...findFiles(join(ROOT, "app", "api", "v1"), (name) => name === "route.ts"),
];

const violations = [];

for (const file of targets) {
  const src = readFileSync(file, "utf8");

  // Explicit opt-out: add `// check:entity-ok: <reason>` to files where entityId
  // usage is read-only (filter/select) and assertRowAccess is not applicable.
  if (src.includes("// check:entity-ok")) continue;

  const hasAuthGuard = src.includes("requirePermission(");
  if (!hasAuthGuard) continue;

  const hasEntityId = /\bentityId\b/.test(src);
  if (!hasEntityId) continue;

  const hasGuard =
    src.includes("assertRowAccess(") || src.includes("requireRowAccess(");
  if (hasGuard) continue;

  violations.push(file.replace(ROOT, ""));
}

if (violations.length === 0) {
  console.log("check:entity — OK: all entity-aware write paths are guarded");
  process.exit(0);
} else {
  console.error(
    "check:entity — FAIL: the following files use entityId without assertRowAccess/requireRowAccess:\n"
  );
  for (const v of violations) {
    console.error(`  ✗  ${v}`);
  }
  console.error(
    "\nEach entity-scoped write MUST call assertRowAccess(user, { entityId }) before touching the DB."
  );
  process.exit(1);
}
