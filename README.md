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

## Holat

**0-bosqich (loyiha skeleti)** tayyor. Keyingi bosqich — maʼlumotlar bazasi
sxemasi (v1 §3.2 yadro + v2 §4 delta) va seed. Qarang: [docs/spec.md](docs/spec.md).
