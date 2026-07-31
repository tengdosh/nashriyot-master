# Nashriyot-Master

Nashriyot uchun ERP tizimi (*publishing ERP*). Modulli monolit: **Next.js 15**
(App Router, TypeScript strict) + **Prisma / PostgreSQL 16** + **Redis**, alohida
**Python FastAPI** AI xizmati va **grammY** Telegram bot.

- Toʻliq spetsifikatsiya: [docs/spec.md](docs/spec.md) — V1 §3–§7, V2 §2–§9
- Meʼmoriy qoidalar: [CLAUDE.md](CLAUDE.md)
- Demo dunyo: [docs/demo-data.md](docs/demo-data.md) · Bot: [docs/playbook.md](docs/playbook.md)

## Talablar

- **Node.js 20+** (tavsiya: 22) va npm
- **Docker** + Docker Compose

## Ishga tushirish

```bash
# 1) Muhit oʻzgaruvchilari
cp .env.example .env          # kerak boʻlsa maxfiy qiymatlarni oʻzgartiring

# 2) Infratuzilma: Postgres, Redis, AI xizmati
docker compose up -d

# 3) Bogʻliqliklar
npm install

# 4) Ilova
npm run dev                   # http://localhost:3000
```

AI xizmati sogʻligʻini tekshirish:

```bash
curl http://localhost:8001/health     # {"status":"ok","service":"ai-service"}
```

## Portlar

| Xizmat | Konteyner | Host port | Izoh |
|---|---|---|---|
| PostgreSQL 16 | 5432 | **5433** | lokal 5432 band |
| Redis 7 | 6379 | **6380** | lokal 6379 band |
| AI xizmati (FastAPI) | 8000 | **8001** | `/health` |
| Next.js (dev) | — | **3000** | `npm run dev` |

`.env` dagi `DATABASE_URL` / `REDIS_URL` / `AI_SERVICE_URL` shu portlarga moslangan.

## Buyruqlar

| Buyruq | Vazifa |
|---|---|
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` / `npm start` | Prod build / start |
| `npm run test:unit` | Vitest birlik testlari |
| `npm run test:coverage` | Qamrov hisoboti |
| `npm run e2e` | Playwright E2E (avval `npx playwright install chromium`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:migrate` | Prisma migratsiya (dev) |
| `npm run db:studio` | Prisma Studio |

## Loyiha tuzilishi

```
app/(app)/         # himoyalangan ilova modullari (keyingi bosqichlar)
app/portal/        # muallif portali
app/api/v1/        # REST endpointlar
components/ui/      # shadcn/ui
components/shared/  # umumiy komponentlar (DataTable, FormSheet, ...)
lib/               # finance.ts, services/, validators/, rbac.ts, ...
jobs/              # rejalashtirilgan ishlar (ROP, dead-stock, costing)
ai-service/        # Python FastAPI AI mikroservisi
bot/               # grammY Telegram bot
prisma/            # schema.prisma, migratsiyalar
tests/unit, tests/e2e/   # Vitest, Playwright
docs/              # spec.md, demo-data.md, playbook.md
```

## Maʼlumotlar bazasi (ER diagramma)

Sxema: [prisma/schema.prisma](prisma/schema.prisma) — 40 model, ~34 enum
(v1 §3.2 yadro + v2 §4 delta). Pul = `Decimal(18,2)`, nisbatlar = `Decimal(6,4)`,
valyuta kursi = `Decimal(14,4)`. Muhrlanadigan (SEALED) maydonlar izohlarda
belgilangan. Migratsiya: `npm run db:migrate`, seed: `npm run db:seed`.

```mermaid
erDiagram
  Entity ||--o{ Warehouse : owns
  Entity ||--o{ CostEntry : "fixed costs"
  Entity ||--o{ SalesOrder : sells
  Entity ||--o{ Payment : cashbook
  Entity ||--o{ TransferOrder : "from"
  Entity ||--o{ TransferOrder : "to"
  Partner ||--o{ Warehouse : "agent stock"
  Partner ||--o{ Title : "owns (external)"
  Partner ||--o{ PrintOrder : printer
  Partner ||--o{ SalesOrder : client
  Partner ||--o{ Payable : owed
  Partner ||--o{ Payment : counterparty

  User ||--o{ UserRole : has
  Role ||--o{ UserRole : grants
  Role ||--o{ RolePermission : has
  Permission ||--o{ RolePermission : in
  User ||--o{ AuditLog : writes
  Contributor ||--o| User : "portal login"
  User }o--o{ Entity : entityAccess

  Series ||--o{ Title : contains
  Title ||--o{ Edition : editions
  Title ||--o{ Product : SKUs
  Title ||--o{ TitleContributor : credits
  Title ||--o{ CostEntry : "unique costs"
  Title ||--o{ Contract : contracts
  Title ||--o{ ProductionTask : tasks
  Title ||--o{ Lead : interest
  Title ||--o{ PlScenario : scenarios
  Edition ||--o{ Product : SKUs
  Edition ||--o{ PrintOrder : "print runs"
  Edition ||--o{ CostEntry : "print costs"
  Edition ||--o{ PlScenario : scenarios
  Contributor ||--o{ TitleContributor : credited
  Contributor ||--o{ Contract : party

  Product ||--o{ InventoryItem : "on hand"
  Product ||--o{ StockMovement : moves
  Product ||--o{ PrintOrder : printed
  Product ||--o{ SalesOrderLine : sold
  Product ||--o{ TransferOrderLine : transferred
  Product ||--o{ OnixExport : onix
  Product ||--o{ Forecast : forecasts
  Product ||--o{ PriceRecommendation : pricing
  Product ||--o| ReorderRule : reorder
  Product ||--o{ DailyUnitCost : costing

  Warehouse ||--o{ InventoryItem : holds
  Warehouse ||--o{ StockMovement : ledger
  Warehouse ||--o{ SalesOrder : ships
  User ||--o{ ProductionTask : assignee
  ProductionTask ||--o{ ProductionTask : dependsOn

  SalesChannel ||--o{ SalesOrder : channel
  SalesOrder ||--o{ SalesOrderLine : lines
  SalesOrderLine ||--o{ Return : returns
  SalesOrder ||--o| Lead : "converted from"
  User ||--o{ Lead : assignee
  TransferOrder ||--o{ TransferOrderLine : lines

  Contract ||--o{ RoyaltyTier : tiers
  Contract ||--o{ RoyaltyStatement : statements
  RoyaltyRun ||--o{ RoyaltyStatement : statements
  User ||--o{ RoyaltyRun : "created/approved"
  User ||--o| TelegramLink : "bot link"

  Entity {
    string code PK "TASNIM/TAHLIL/SOTUV_BOLIMI"
    EntityType type
  }
  Partner {
    string name
    PartnerRoles roles "CLIENT/AGENT/PRINTER/EXT_PUBLISHER/SUPPLIER"
    decimal creditLimit
    Currency currency
    boolean isBlocked
  }
  Title {
    string workTitle
    TitleStatus status
    OwnerType ownerType "OWN/EXTERNAL"
  }
  Edition {
    int editionNo
    int plannedRun
    EditionStatus status
  }
  Product {
    ProductFormat format
    string isbn13 UK
    decimal listPrice
  }
  Warehouse {
    string name
    WarehouseType type "MAIN/SALES/AGENT"
  }
  CostEntry {
    CostScope scope "TITLE/EDITION/FIXED"
    CostCategory category
    decimal amountUZS
  }
  SalesOrderLine {
    int qty
    decimal unitPrice
    decimal discountRate "SEALED"
    decimal cmUnit "SEALED"
  }
  TransferOrderLine {
    decimal basePrice
    decimal discountRate "SEALED"
    decimal transferPrice
  }
  DiscountRule {
    DiscountScope scope "PARTNER>VOLUME>TITLE>ENTITY>DEFAULT"
    int minQty
    decimal rate
    int priority
  }
  Contract {
    ContractType type "BUYOUT/ROYALTY"
    decimal advanceAmount
    boolean audioRights
  }
```

> Standalone (FK-siz, `refId` polimorf): `DiscountRule`, `Notification`, `Setting`.

## Holat (2026-07-27)

### Milestonelar

| # | Milestone | Holat | Commit |
|---|-----------|-------|--------|
| M1 | Boshqaruv paneli (12-ustun vidjet) | ✅ Tugallandi | `4888016` |
| M2 | Sarlavhalar va nashrlar | ✅ Tugallandi | `bcd8e0e` |
| M3 | Moliyaviy yadro + P&L editor | ✅ Tugallandi | `a10bc4a` |
| M4 | Ishlab chiqarish (print orderlar) | ✅ Tugallandi | `31c5d7d` |
| M5 | Ombor + konsignatsiya | ✅ Tugallandi | `a838cb6` |
| M6 | Sotuv & Marja | ✅ Tugallandi | `30f9000` |
| M7 | Huquqlar & Royalti | ✅ Tugallandi | `814814d` |
| M8 | Muallif portali | ✅ Tugallandi | `cb7e32a` |
| M9 | Analitika & BI | ✅ Tugallandi | `aad467c` |
| M10 | AI Studio (prognoz, dinamik narx) | ✅ Tugallandi | `4888016` |
| M11 | Administratsiya | ✅ Tugallandi | `a959cfa` |
| M12 | Jonli tan-narx dvigateli | ✅ Tugallandi | `363017f` |
| M13 | Sub'ektlar va ichki savdo | ✅ Tugallandi | `fa611f7` |
| M14 | CRM & Lidlar | ✅ Tugallandi | `0a1dfa4` |
| M15 | Moliya markazi (AR/AP) | ✅ Tugallandi | `128fefa` |
| M16 | Telegram hisobot boti | ✅ Tugallandi | `2043429` |
| M17 | GEO annotatsiya (SEO) | ✅ Tugallandi | `88dcbfc` |
| M18 | Audiokitob (TTS) | ✅ Tugallandi | `faf1820` |
| M19 | CSV import | ✅ Tugallandi | `dd61318` |
| M20 | E2E test to'plami (9 ssenarey) | ✅ Tugallandi | `pending` |
| M26 | Mobil PWA + tez kiritish | ✅ Tugallandi | `pending` |
| M27 | Recurring costs | ✅ Tugallandi | `pending` |
| M28 | Telegram kiritish (DRAFT) | ✅ Tugallandi | `pending` |

### Texnik stek

| Komponent | Texnologiya | Versiya |
|-----------|-------------|---------|
| Frontend | Next.js (App Router) | 15.5.21 |
| Styling | Tailwind v4 + shadcn/ui (Base UI) | 4.x |
| ORM | Prisma (classic provider) | 6.19.3 |
| Auth | Auth.js v5 | beta.32 |
| AI | OpenAI + Claude API | latest |
| Bot | grammY | 1.x |
| DB | PostgreSQL 16 (port 5433) | 16 |
| Cache | Redis 7 (port 6380) | 7 |
| AI Servis | FastAPI Python 3.12 (port 8001) | 0.1.0 |

### Ish boshlash

```bash
# 1. Environment
cp .env.example .env  # to'ldiring

# 2. Docker
docker compose up -d

# 3. DB + seed
npm run db:migrate
npm run db:seed
npm run seed:demo     # demo ma'lumotlar

# 4. Dev server
npm run dev

# Login: director@tasnim.uz / Parol123!
```

---

## Zaxira va tiklash

### Cron o'rnatish (prod server)

```bash
# Har kecha 02:00 da backup (30 kun saqlash)
crontab -e
# Qo'shing:
0 2 * * * DATABASE_URL="postgresql://nashriyot:PAROL@localhost:5533/nashriyot?schema=public" \
  BACKUP_DIR=/home/user/nashriyot-backups \
  bash /home/user/nashriyot-deploy/deploy/backup.sh 30 >> /var/log/nashriyot-backup.log 2>&1
```

### Sinov (har doim ishga tushiring!)

```bash
# Backup → tiklash → yozuv taqqoslash
DATABASE_URL="postgresql://..." bash deploy/test-backup-restore.sh
```

### Tiklash qadamlari

1. Servisni to'xtatish: `sudo systemctl stop nashriyot-prod`
2. Restore skriptini ishga tushiring:
   ```bash
   bash deploy/restore.sh /home/user/nashriyot-backups/nashriyot_20260730_020000.sql.gz
   ```
3. Migratsiaylarni tekshiring: `npx prisma migrate deploy`
4. Servisni qayta ishga tushiring: `sudo systemctl start nashriyot-prod`

> **Eslatma:** Offsite nusxa (Google Drive) hali yo'q — keyinroq qo'shiladi.
> Hozircha backuplar `/home/user/nashriyot-backups/` da mahalliy saqlanadi.
> Muhim ma'lumotlar uchun qo'lda tashqi diskka nusxa oling.

---

## Ma'lum zaifliklar

`npm audit` 3 ta **high** darajadagi CVE topdi (2026-07-31 holati):

| Paket | CVE | Tavsif | Nima uchun tuzatilmagan |
|-------|-----|--------|------------------------|
| `sharp` (Next.js ichida) | CVE-2026-33327, -33328, -35590, -35591 | libvips zaifliklar | Fix Next.js ni 9.x ga tushirishni talab qiladi (breaking) |
| `postcss` (Next.js ichida) | GHSA-xxx | XSS via `</style>` va sourceMappingURL | Yuqoridagi bilan bir xil sabab |
| `next` (bevosita) | next@15 zaruriy | sharp/postcss orqali meros | Next 15→9 o'tish mumkin emas |

**Qachon qayta ko'riladi:** Next.js keyingi minor relizida (15.x) ushbu CVElar patch
qilinishi kutilmoqda. `npm audit` da "fix available via `npm audit fix --force`" deb
ko'rsatilsa ham, `--force` Next.js 9 ga downgrade qiladi — bu butun loyihani buzadi.

**Vaqtinchalik choralar:**
- Bu zaifliklar faqat Next.js build/image processing bosqichida mavjud
- Server-side rendering yo'li orqali ekspluatatsiya qilinishi qiyin
- `sharp` faqat rasmlarni optimallashtirish uchun ishlatiladi (ONIX/fayl yuklash)

**Kuzatish:** Har oyda `npm audit` ishga tushiring va Next.js patch'larini kuzating.
