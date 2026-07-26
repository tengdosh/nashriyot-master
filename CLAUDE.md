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

## Pinned decisions
Architectural deviations from the literal spec, locked in (rationale in git history):
- **Prisma 6** (not 7) — classic `prisma-client-js`; import
  `{ PrismaClient } from "@prisma/client"`. Prisma 7's new config/runtime model
  was avoided to keep the spec-aligned workflow (`migrate dev`, `studio`, `db seed`).
- **shadcn 4.x on Base UI** primitives (style `base-nova`, lucide icons) — not
  Radix. Theme retuned to **slate neutrals + `--primary: #800E13`** (also
  `--sidebar-primary`) in `app/globals.css`.
- **No `@vitejs/plugin-react`** — it pulls Babel 8, conflicting with the `shadcn`
  package's Babel 7. Vitest transforms TSX via its built-in **esbuild**.
- **postgres:16 → host port 5433**, **redis:7 → host port 6380** (local 5432/6379
  occupied). See `.env` / `docker-compose.yml`.
- **M5 revenue/CM read SEALED sales lines (done in M6).** ABC annual revenue =
  sealed net revenue from shipped orders net of returns; the valuable-backlist
  CM12 = sealed `cmUnit` × kept copies. Stock issued WITHOUT a sales order
  (opening balances, migrated history) still falls back to listPrice/FIFO so a
  legacy SKU is not ranked at zero. See `reorder-service.annualRevenue` and
  `dead-stock-service.backlistSignals`.
- **Prisma `not:` skips NULL rows.** `refType: { not: "SalesOrder" }` drops every
  row where refType IS NULL (SQL three-valued logic). Always pair it with an
  explicit `OR: [{ field: null }, …]` — this silently zeroed the whole ABC curve
  once.
- **CM is written exactly once, in `shipSalesOrder`.** Everything downstream
  reads the sealed `cogsUnit`/`cmUnit`; no screen or report recomputes a shipped
  margin, so a later price, channel-fee or discount-rule change cannot move it.
- **P_min = uc / (1 − discount − royalty)** is checked against the LIST price at
  order-save time. A breach is a hard block; `overridePMin` needs
  `admin.settings` and raises a notification. `discount + royalty >= 1` reports
  an infinite floor instead of throwing.
- **A royalty estimate per copy exists only for a ROYALTY contract.** BUYOUT
  author money is already a title-unique cost (M3), so charging it per copy in CM
  would double-count it.
- **Royalty tiers are CUMULATIVE over the contract's life, per format.** A
  period's units are placed at `cumulativeBefore` on the lifetime axis and may
  span several tiers. `cumulativeBefore` is derived from sealed sales BEFORE the
  period — NOT from prior statements — so a period that was never run still
  advances the ladder and a re-run is byte-identical.
- **A sealed royalty period owns its date window.** Checking only the period
  LABEL is not enough: "2026-H1" and "2026-M03" would each pay the author for the
  same March sales. `runRoyalty` refuses any window overlapping a sealed run, and
  `assertDateNotSealed` guards late edits.
- **Reserve release and payable are floored at zero.** If last period's returns
  cost more than was held back, the publisher absorbs it; a period never bills an
  author. Clawing back would make a statement the author already received
  retroactively wrong — which is the exact thing the reserve exists to prevent.
- **An ACTIVE contract's tier table is frozen** (and its advance too, once a
  statement exists). Re-rating history would break the §6.5 determinism promise.
- **The author portal is row-scoped by `contributorId` in the query, never the
  UI.** Every `portal-service` function takes a contributorId and filters to it;
  `portalStatementForContributor` is the authoritative access check and throws
  the SAME generic error for another author's / unsent / missing statement (no
  info leak). The portal shows ONLY `status: SENT` runs.
- **Report downloads are gated twice:** an HMAC-signed, 15-min token
  (`signReportToken`/`verifyReportToken`) AND a fresh DB ownership + SENT
  re-check in the route. A leaked or forged link cannot cross authors or outlive
  its window. Signing key = `AUTH_SECRET`.
- **The `/portal` prefix is AUTHOR-only in middleware; `/api/portal/*` is NOT**
  (the matcher excludes `/api`) — the download route defends itself with the
  token, so never assume middleware ran for it.
- **Seeded author login:** `author@nashriyot.uz` (role AUTHOR, linked to
  `contrib-author-demo`). It has `portal.read` only — no admin app access.
- **Analytics reads materialized views ONLY, never live tables.** `mv_monthly_sales`
  / `mv_title_kpi` / `mv_ar_aging` are raw-SQL objects (not Prisma-managed),
  refreshed by `analytics-service.refreshViews()` (nightly `refresh-views` job,
  runs LAST so it captures the other jobs, + a manual admin button). A report can
  lag the last refresh — that is by design; heavy aggregation never hits the
  request path. Each view has a UNIQUE index so REFRESH CONCURRENTLY works.
- **P&L by entity reconciles to a summed Jami row** (`analytics.pnlRollup`):
  revenue/COGS from `mv_monthly_sales`, royalty from SENT statements by title
  entity, FIXED from `cost_entries`. Margins divide by revenue, 0 when revenue is
  0 (never NaN). Golden import check: ~2.64 bln revenue → ~735 mln net, ~27.8%.
- **New migrations are applied with `prisma migrate deploy`, not `dev`** (the
  sandbox is non-interactive). Generate the SQL with `prisma migrate diff
  --from-schema-datasource … --to-schema-datamodel … --script` into a
  timestamped folder, then `deploy`. Materialized views live in a hand-written
  migration.
- **Dashboard drag-drop is native HTML5, NOT dnd-kit** (pinned deviation from
  the spec's named library — keeps M1 dependency-free, consistent with the other
  no-extra-dep decisions). 12-col grid; a widget's `w`/order/hidden are client
  state, but widget CONTENT is server-rendered and passed to the board as React
  nodes, so dragging never re-fetches. Layout is a per-user JSONB override
  (`DashboardLayout`) on top of a code-derived `roleDefaultLayout`.
- **Widget permissions are authorization, layout is preference.** `resolveVisibleWidgets`
  drops any widget whose permission the user lacks regardless of the stored
  layout. A saved layout is re-normalized server-side on every save (untrusted
  client input). Every widget reads ONLY materialized views / notifications /
  tasks and self-guards its data fetch, so one failing widget never breaks the board.
- **AI service is stateless and never touches the DB.** The Next app sends
  history/points as JSON to the Python FastAPI container (`AI_SERVICE_URL`, bearer
  `AI_SERVICE_TOKEN`); `lib/ai-client.ts` reads env at call time and returns null
  on any error/timeout (graceful degradation — pages show "AI unavailable", never
  crash). Rebuild it with `sg docker -c "docker compose build ai-service"` then
  `up -d`.
- **AI pattern: recommend → human approve → act. AI never mutates on its own.**
  A forecast persists but `applyForecastToReorder` is BLOCKED when MAPE>40%
  (`forecastConfidence` LOW); a price is a `PriceRecommendation` that `acceptPrice`
  (ai.apply) applies, refusing any suggestion below the floor. The floor is P_min
  today; swap to `getDecisionFloor` once M12 lands (marked in pricing-service).
- **M10 scope: AI-1 forecast + AI-2 pricing are built and tested.** GEO (Claude
  API) and audio (TTS) are deferred stub pages — they need real external keys not
  available in this environment, and are the spec's own last rollout step (AI-4).
  When building GEO, load the `claude-api` skill first.
- **System roles (DIRECTOR, ADMIN) are immutable in the role matrix.** `lib/admin.isSystemRole`
  guards both the UI checkboxes and `setRolePermissions` — they always hold every
  permission. `setRolePermissions` also drops permission codes that don't exist.
- **Invited/reset users get a strong temp password shown ONCE** (`generateTempPassword`,
  argon2-hashed, plaintext never stored). Every admin write goes through
  `runWithAudit`, so the admin screens are themselves in the audit log; the log
  viewer diffs before/after via `lib/admin.auditDiff` (ignores timestamps).
- **Live cost engine (M12): three layers stay SEPARATE, combined only in
  daily_unit_cost.** `reportCost = unique + print + accruedFixed` (accounting);
  `decisionCost = print + daily holding` (today's pricing floor, sunk-free) — the
  unique/fixed layers NEVER enter decisionCost. `costing-service.computeDailyCost`
  upserts by [productId, date] and accrues the fixed layer onto the prior day's
  `allocFixedCum` (idempotent same-day re-run). The `costing-snapshot` job runs
  FIRST in the nightly chain (dead-stock reads reportCost from it).
- **Pricing floor = getDecisionFloor (M12 decisionCost) when a snapshot exists,
  else the P_min/FIFO fallback.** Dead-stock values frozen stock at reportCost
  when a snapshot exists, else FIFO — so the golden 59.45M test still holds with
  no snapshot. Break-even alert (`daysUntilCross <= 30`) links to /costing/[id].
- **A transfer (M13) is an internal SALE across entities.** On RECEIVE the goods
  leave the sender (FIFO OUT — counts as sold) and enter the receiver as a NEW
  FIFO layer priced at `transferPrice` (base − sealed discount) — the receiving
  entity's cost basis, NOT the original print cost. The P_min floor
  (decisionCost, else P_min/FIFO) applies to internal trade too; override needs
  `transfers.override` and is audited. The inter-entity ledger nets RECEIVED
  transfers against `EntitySettlement`s (`lib/transfer.nettedLedger`; the value
  source always nets as creditor).
- **REDEPLOY REQUIRES `npx prisma generate` ON THE SERVER after any schema
  change**, before `npm run build` — the server's generated client is stale
  otherwise and the build fails with "Property 'X' does not exist". Full server
  redeploy: rsync → `prisma migrate deploy` → **`prisma generate`** → `npm run
  build` → copy static/public/.prisma into `.next/standalone` → `systemctl
  restart nashriyot-prod`.
- **A sellable RETURN is its own FIFO layer**, not a second IN row
  (`inventory-service.LAYER_TYPES`) — so returned copies stay countable in the
  four-state view and consumable by `fifoIssue` without double-counting.
- **Write-offs and stock corrections are typed ADJUST, never OUT**, so nothing
  but a real sale can ever land in the "Sotilgan" figure.
- **Finance centre (M15) never recomputes a sealed number — it aggregates.**
  Cash is Σ IN − Σ OUT of `Payment` per entity; AR/AP totals are the same
  `amountUZS − paidUZS` outstanding the AR/AP screens show. `Payable.paidUZS`
  (added M15) mirrors `Receivable.paidUZS`: partial pays flip status to PARTIAL,
  full to PAID, an overpay is refused and a PAID row can't be paid again. Paying
  an AP writes a `Payment` with `direction=OUT, refType="Payable"` — that OUT is
  what later shows up as PENDING in reconciliation.
- **Reconciliation is match-only, never a money mutation.** `reconAutoMatch`
  (pure, greedy one-to-one) pairs a PENDING payment to a bank row on partner +
  amount(±tol) + date(±days); `applyMatch` only stamps `reconStatus=MATCHED` +
  `bankRef`. It never creates/moves a payment. The recon UI's "Toʻlovlardan"
  button mirrors pending payments into a bank file purely as a demo affordance.
- **GEO (M17) & audio (M18) follow AI recommend→approve→act and degrade to a
  warning banner without external keys.** GEO: `lib/ai/claude.ts` (`@anthropic-ai/sdk`,
  reads `ANTHROPIC_API_KEY` at call time, returns null on no-key/error/timeout —
  same contract as `lib/ai-client.ts`) → `geo-service.generateGeoRecommendation`
  writes a DRAFT `GeoAnnotation`; `approveGeoAnnotation` (ai.apply) flips it
  APPROVED **and writes metaDescription/keywords back to the live Title**. Prompt
  is versioned in `lib/prompts/geo.ts` (`GEO_PROMPT_VERSION`, stored on every row),
  output Zod-validated (`parseGeoResult`). Default model `claude-opus-5` (env
  `APP_AI_MODEL`). Audio: `createAudioJob` **BLOCKS unless an ACTIVE contract has
  `audioRights`** (`AudioRightsError`); `lib/audio.ts` (pure, 100%) splits the
  manuscript into chapters; `lib/tts/adapter.ts` is a provider-swappable seam
  whose default `"none"` provider returns null → chapters stay QUEUED with a note
  (env `TTS_PROVIDER` picks a real adapter later). Gen/split = ai.read, approve/
  synth = ai.apply. Both are the spec's AI-4 final step — they build & test fully
  without keys; only live output needs the key.
- **CSV import (M19) is dry-run-first and catalog-idempotent.** `lib/import-map.ts`
  (pure, 100%) parses CSV + coerces uz dates/money + normalizes titles; two
  templates (kirimlar, sotuv). `import-service.previewImport` NEVER writes (counts
  + per-row errors); `commitImport` is one audited transaction. Dedup keys:
  **Title by `normalizeTitleKey` (cyrill→latin fold → one work), Product by
  `importProductSku` (script-PRESERVING → latin+cyrill = two SKUs under one
  title), Partner by name.** kirimlar → `stockIn` FIFO layers (unitCost =
  Summa_dona) in the first PUBLISHER entity's MAIN warehouse; sotuv → historical
  **SHIPPED** orders written DIRECTLY (bypassing the live sales state machine —
  P_min/credit checks must not gate migrated facts) with sealed
  discountRate/cogsUnit(=Kirim)/cmUnit; channel from Holat (Ulgurji→DISTRIBUTOR,
  else RETAIL). Orders are NOT deduped — run sotuv import once. Real xlsx→CSV
  files (Sotuv_2025-2026, kirimlar, Foyda_Zarar_2026 = the M9 P&L golden ~2.64bln
  →735mln) still pending; engine is fixture-tested.
- **The Telegram bot (M16) is READ-ONLY and DB-blind.** `bot/` (grammY, long
  polling) never imports Prisma; every number comes from `GET /api/v1/reports/:name`
  gated by `Bearer REPORTS_API_TOKEN` + `x-user-id`. The report layer
  (`reports-service.runReport`) re-checks BOTH `reports.read` (base gate) AND the
  report's specific permission, and forces the acting user's entity scope in —
  the caller can never widen it. The whitelisted catalog is the single source of
  truth (`lib/reports-catalog.ts`, pure, 100%): menu, Zod params, and Claude
  tool-use `input_schema` all derive from it. Free-question AI is Claude tool-use
  restricted to those tools (no SQL, "don't guess" system prompt); it degrades to
  the menu when `ANTHROPIC_API_KEY` is unset (same null-safe pattern as ai-client).
- **Chat linking:** one-time 6-digit code, **HMAC-SHA256(AUTH_SECRET)** hashed
  (deterministic → O(1) lookup, unlike argon2), 10-min TTL, single-use
  (`TelegramLinkCode`). Generated on `/profile` (session), redeemed by the bot via
  `POST /api/v1/telegram/link`. The bot reads its identity+menu from
  **`GET /api/v1/telegram/me?chatId=`** (its OWN route — not `/link`; the bot's
  api.ts hard-codes `/me`). Token-less bot **idles** (setInterval), never
  `process.exit`, so `restart: unless-stopped` can't crash-loop it.
- **DEPLOY TARGET 172.30.0.36 IS THIS SAME MACHINE** (hostname `madaniyat`; its
  `~/nashriyot-master` git HEAD == local HEAD; `~/nashriyot-deploy` is visible
  locally). No SSH/sshpass needed — deploy is entirely local: `rsync -a --delete
  --exclude node_modules --exclude .next --exclude .git --exclude .env
  nashriyot-master/ nashriyot-deploy/` → in deploy `prisma migrate deploy`
  (**prod DB is separate: localhost:5533**, dev is 5433) → `prisma generate` →
  `npm run build` → copy `.next/static`, `public`, `node_modules/.prisma` into
  `.next/standalone/` → `sudo systemctl restart nashriyot-prod` (port 3100).
  Sudo password `p1234567m`. Verify: authenticated curl (Auth.js csrf →
  callback/credentials, seed login `director@nashriyot.uz` / `Parol123!`).

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
