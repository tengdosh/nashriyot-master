# Nashriyot-Master — publishing ERP (Uzbekistan)

## Stack
Next.js 15 App Router + TypeScript strict. Tailwind + shadcn/ui.
PostgreSQL 16 + Prisma. Auth.js v5. Zod everywhere. Vitest + Playwright.
AI microservice: Python 3.12 FastAPI in /ai-service (separate container).
Telegram bot: grammY (TypeScript) in /bot (separate container).

## Business model (v2)
Three accounting entities: TASNIM (publisher), TAHLIL (publisher),
SOTUV_BOLIMI (internal distributor). Entities trade with each other via
transfer_orders (base price minus a SEALED per-line discount).
Books have editions: 1st edition carries unique costs (rights, translation,
editing, buyout author fees); reprints only carry print costs.
Printing is ALWAYS outsourced (partners with PRINTER role, multi-currency).
Author contracts are either BUYOUT (one-time fee -> title-unique cost)
or ROYALTY (full royalty engine). Agents are motivated purely by their
personal discount; they hold consignment stock in AGENT-type warehouses.

## Architecture rules
- Modular monolith. Modules NEVER import each other's internals;
  they talk through lib/services/* and domain events.
- ALL financial formulas live in lib/finance.ts as pure functions.
  Never duplicate a formula in a component. Money = Prisma Decimal(18,2).
  Currency-bearing records store currency + rateToUZS + amountUZS.
- Every write goes through a service that: validates (Zod) -> checks
  RBAC (requirePermission) -> writes -> audit-logs (before/after JSONB).
- Soft delete only (archivedAt). Hard delete = admin + confirm.
- Status changes only via explicit transition functions (state machines).
- Discounts are SEALED on document lines at save time; changing a rule
  later never changes historical documents.
- Live unit cost engine (M12): unique layer + print layer (FIFO) +
  fixed-cost copy-day allocation are kept separate in the DB and only
  combined in daily_unit_cost. Never double-count. Two numbers always
  coexist: reportCost (full) and decisionCost (sunk-cost-free).
- P_min floor is enforced everywhere a price/discount is set, including
  internal transfers. AI pricing floor = decisionCost, not reportCost.

## RBAC
Permission codes like 'inventory.write', 'royalty.approve', 'ai.apply',
'reports.read'. Row-level: users carry entityAccess[]; authors scoped by
contributorId. Maker-checker: royalty runs & write-downs — createdBy !=
approvedBy, enforced in UI and server.

## UI conventions
Uzbek (Latin) UI language. Currency UZS, format '12 000 000 so'm'.
Dates dd.mm.yyyy. Numbers tabular-nums. Primary color #800E13.
Lists = shared DataTable; forms = FormSheet (side panel, not modal);
statuses = StatusBadge. Every computed number gets an info tooltip
showing its formula inputs. Every alert links to the screen that fixes it.

## Bot (bot/ directory)
grammY + TypeScript, long polling, separate docker service.
READ-ONLY: only calls /api/v1/reports/* with REPORTS_API_TOKEN.
Never talks to the DB directly. Never performs writes of any kind.
AI answers: Claude tool-use over a whitelisted report-function catalog;
no SQL generation; every number must come from API data.
All user-facing text in Uzbek (Latin).

## Testing
lib/finance.ts, costing engine and royalty engine: 100% unit coverage,
run before every commit: npm run test:unit. Golden test values live in
docs/spec.md (V1 §6.1, §6.2). Demo world (docs/demo-data.md) self-asserts.

## Commands
npm run dev | npm run test:unit | npm run e2e | npm run seed:demo
npx prisma migrate dev | docker compose up -d
Note: host port for postgres:16 is 5433 (local 5432 is occupied).

---

## Local dev notes (this environment)
- Node 22 (NodeSource) + npm. Prisma pinned to **6.x** (classic
  `prisma-client-js`; import `{ PrismaClient } from "@prisma/client"`).
  Prisma 7 was intentionally avoided (new config/runtime model).
- Tailwind **v4** + shadcn (base-nova / Base UI primitives, lucide icons).
  Theme is slate neutrals with `--primary: #800E13` (also the
  sidebar-active colour) in `app/globals.css`.
- Infra via Docker Compose (`docker compose up -d`) — **infra only**, the
  Next app runs on the host with `npm run dev`. Host ports:
  postgres → **5433**, redis → **6380**, ai-service → **8001**.
- In this sandbox, run docker via `sg docker -c "…"` (or sudo) until a
  re-login activates docker-group membership.
- Spec: `docs/spec.md` (V1 §3–§7, V2 §2–§9); demo world:
  `docs/demo-data.md`; bot playbook: `docs/playbook.md`.
