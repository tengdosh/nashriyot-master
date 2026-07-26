-- M9 analytics materialized views (spec v1 §5.8). Not managed by Prisma; created
-- here and refreshed by the analytics service / nightly job. Every view reads
-- ONLY sealed sales data (shipped lines, sealed cogsUnit/cmUnit), so analytics
-- can never disagree with what an order card showed.

-- ── mv_monthly_sales: month × product × channel ──────────────────────────────
-- Net of returns booked against the line; net revenue applies the sealed channel
-- fee. Attributed to the ship month.
CREATE MATERIALIZED VIEW mv_monthly_sales AS
SELECT
  to_char(date_trunc('month', so."shippedDate"), 'YYYY-MM')      AS month,
  sol."productId"                                                 AS "productId",
  so."channelId"                                                  AS "channelId",
  so."entityId"                                                   AS "entityId",
  SUM(sol.qty - COALESCE(r.returned, 0))::int                     AS units,
  SUM(sol."unitPrice" * sol.qty)                                  AS gross_revenue,
  SUM(
    sol."unitPrice" * (1 - sol."discountRate") * (1 - COALESCE(sc."feeRate", 0))
    * (sol.qty - COALESCE(r.returned, 0))
  )                                                               AS net_revenue,
  SUM(COALESCE(sol."cogsUnit", 0) * (sol.qty - COALESCE(r.returned, 0)))  AS cogs,
  SUM(COALESCE(sol."cmUnit", 0) * (sol.qty - COALESCE(r.returned, 0)))    AS cm
FROM "SalesOrderLine" sol
JOIN "SalesOrder" so   ON so.id = sol."orderId"
JOIN "SalesChannel" sc ON sc.id = so."channelId"
LEFT JOIN (
  SELECT "orderLineId", SUM(qty) AS returned FROM "Return" GROUP BY "orderLineId"
) r ON r."orderLineId" = sol.id
WHERE so.status IN ('SHIPPED', 'INVOICED', 'PAID')
  AND so."shippedDate" IS NOT NULL
GROUP BY 1, 2, 3, 4;

CREATE UNIQUE INDEX mv_monthly_sales_key
  ON mv_monthly_sales (month, "productId", "channelId");
CREATE INDEX mv_monthly_sales_entity ON mv_monthly_sales ("entityId");

-- ── mv_title_kpi: lifetime KPI per title ─────────────────────────────────────
CREATE MATERIALIZED VIEW mv_title_kpi AS
SELECT
  t.id                                        AS "titleId",
  t."workTitle"                               AS work_title,
  t."entityId"                                AS "entityId",
  COALESCE(SUM(ms.units), 0)::int             AS units,
  COALESCE(SUM(ms.net_revenue), 0)            AS net_revenue,
  COALESCE(SUM(ms.cogs), 0)                   AS cogs,
  COALESCE(SUM(ms.cm), 0)                     AS cm
FROM "Title" t
LEFT JOIN "Product" p ON p."titleId" = t.id
LEFT JOIN mv_monthly_sales ms ON ms."productId" = p.id
WHERE t."archivedAt" IS NULL
GROUP BY t.id, t."workTitle", t."entityId";

CREATE UNIQUE INDEX mv_title_kpi_key ON mv_title_kpi ("titleId");

-- ── mv_ar_aging: one row per open receivable, bucketed at refresh time ────────
CREATE MATERIALIZED VIEW mv_ar_aging AS
SELECT
  rec.id                                       AS "receivableId",
  rec."entityId"                               AS "entityId",
  rec."partnerId"                              AS "partnerId",
  (rec."amountUZS" - rec."paidUZS")            AS outstanding,
  rec."dueDate"                                AS due_date,
  CASE
    WHEN rec."dueDate" IS NULL OR rec."dueDate" >= now() THEN 'CURRENT'
    WHEN now()::date - rec."dueDate"::date <= 30  THEN 'D0_30'
    WHEN now()::date - rec."dueDate"::date <= 60  THEN 'D31_60'
    WHEN now()::date - rec."dueDate"::date <= 90  THEN 'D61_90'
    ELSE 'D90_PLUS'
  END                                          AS bucket
FROM "Receivable" rec
WHERE rec.status IN ('OPEN', 'PARTIAL')
  AND (rec."amountUZS" - rec."paidUZS") > 0;

CREATE UNIQUE INDEX mv_ar_aging_key ON mv_ar_aging ("receivableId");
CREATE INDEX mv_ar_aging_entity ON mv_ar_aging ("entityId");
