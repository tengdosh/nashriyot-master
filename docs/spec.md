# Nashriyot-Master — Texnik Spetsifikatsiya (docs/spec.md)
# Tarkib: V1 (§3–§7) + V2 (to'liq). Promptlar "v1 §X" / "v2 §X" deb shu bo'limlarga ishora qiladi.

═══════════════════════════════════════════════════════════
# V1 QISM
═══════════════════════════════════════════════════════════

## v1 §3. Tizim arxitekturasi

### v1 §3.1. Umumiy ko'rinish
Ikki ishga tushiriladigan qism: asosiy ilova (Next.js modulli monolit) va
AI xizmati (FastAPI); Docker Compose ichida PostgreSQL 16 + Redis bilan
(+ keyinroq bot service). Modullar bir-birini bevosita chaqirmaydi —
umumiy domen xizmatlari (lib/services/*) va hodisalar orqali bog'lanadi.
Masalan: buyurtma "shipped" bo'lganda inventory xizmati stock-out yozadi,
royalti xizmati sotuv faktini belgilaydi.

### v1 §3.2. Ma'lumotlar bazasi sxemasi (v1 yadro)
Barcha pul maydonlari Decimal(18,2); hamma jadvalda id (cuid),
createdAt, updatedAt.

**Identifikatsiya:** users(email, passwordHash, fullName, isActive,
contributorId?), roles, permissions(code masalan 'inventory.write',
module), role_permissions, user_roles, audit_log(userId, action, entity,
entityId, before JSONB, after JSONB).

**Katalog (M2):** titles(workTitle, status enum DRAFT→REVIEW→APPROVED→
ACTIVE→OUT_OF_PRINT, language, seriesId?, description, keywords[],
themaCodes[], bisacCodes[], searchVector tsvector), products/SKU(titleId,
format enum HARDCOVER/PAPERBACK/EBOOK/AUDIO, isbn13 unique, pages,
listPrice, vatRate), contributors(fullName, role enum, bio),
title_contributors, series, onix_exports(productId, version, xml, channel).

**Akvizitsiya/ishlab chiqarish/ombor (M3–M5):** pl_scenarios(titleId?,
name, fixedCosts JSONB, pagesCount, perPageCost, fixedPrintCost, printRun,
sellThroughRate, discountRate, royaltyRate, targetMargin, natijalar keshi),
print_orders(productId, printerId, quantity, unitPPB, fixedCost, status
SO'ROV→TASDIQLANGAN→BOSILMOQDA→QABUL, expectedDate, receivedQty),
production_tasks(titleId, name, assigneeId, startDate, dueDate, status,
dependsOnId?), warehouses(name, location), inventory_items(productId,
warehouseId, qtyOnHand, qtyReserved; Available = QoH − Reserved),
stock_movements(productId, warehouseId, type IN/OUT/TRANSFER/ADJUST/RETURN,
qty, refType, refId, unitCost — FIFO qatlamlari shu IN yozuvlaridan),
reorder_rules(productId, leadTimeDays, serviceLevelZ, manualROP?, isAuto).

**Sotuv/royalti/prognoz (M6, M7, M10):** sales_channels(name, type
RETAIL/MARKETPLACE/DISTRIBUTOR/OWN_STORE, defaultDiscount, feeRate,
paymentTermDays), sales_orders(channelId, customerName, status
DRAFT→CONFIRMED→SHIPPED→INVOICED→PAID +CANCELLED, orderDate, dueDate),
sales_order_lines(orderId, productId, qty, unitPrice, discountRate,
cogsUnit, cmUnit — CM muhrlanadi), returns(orderLineId, qty, condition
SELLABLE/DAMAGED, date), contracts(contributorId, advanceAmount,
reserveRate, status), royalty_tiers(contractId, format, fromUnits,
toUnits?, rate, basis LIST/NET), royalty_runs(period, status
DRAFT→APPROVED→SENT), royalty_statements(contractId, earned, reserveHeld,
advanceRecouped, payable, pdfPath), forecasts(productId, method,
horizonMonths, values JSONB, mape), price_recommendations(productId,
currentPrice, suggestedPrice, floorPrice, rationale, status),
notifications, settings.

### v1 §3.3. API va xavfsizlik
- Server Actions (formalar) + REST Route Handlers /api/v1/* (jadval
  ma'lumotlari, AI, tashqi).
- Yagona javob: { data, error:{code,message}, meta:{page,total} };
  barcha kirishlar Zod (lib/validators/).
- RBAC ikki qatlam: middleware (route→permission) + xizmat qatlami
  requirePermission()/requireRowAccess(). Menyu shu kodlardan quriladi.
- Maker-checker: royalty run va write-down'da createdBy ≠ approvedBy.
- Audit: Prisma middleware har yozishni before/after bilan yozadi.
- AI xizmati faqat server-to-server, docker network ichida, umumiy token.

### v1 §3.4. Papka tuzilishi
app/(app)/{dashboard,titles,acquisitions,production,inventory,sales,
royalties,analytics,ai,admin}, app/portal/, app/api/v1/, components/
{ui,shared}/, lib/{finance.ts,services/,validators/,rbac.ts,audit.ts,
onix.ts,prompts/}, jobs/, prisma/, ai-service/, bot/, tests/, docs/.

## v1 §4. UI/UX dizayn tizimi

### v1 §4.1. Layout
Chap sidebar 240/64px (modullar, ruxsatga qarab filtrlangan, faol modul
burgundy indikator); topbar: breadcrumb, ⌘K global qidiruv (tezaurusli),
bildirishnoma qo'ng'irog'i, tez amallar; kontent max 1440px; formalar
modal emas — o'ngdan FormSheet; portal (M8) alohida soddalashtirilgan
layout (3 bo'lim, sidebar'siz).

### v1 §4.2. Vizual til
Asosiy rang #800E13 (hover #40090C); neytral slate (fon #F8FAFC, matn
#0F172A); semantik: yashil #16A34A / sariq #D97706 / qizil #DC2626;
Inter, jadval 13px, raqamlar tabular-nums; radius 8px; zich jadval
(qator 40px).

### v1 §4.3. 8 standart komponent
DataTable (TanStack: server pagination, sort, filtr, ustun yashirish,
CSV eksport, bo'sh holat) · KpiCard (raqam, o'zgarish %, sparkline) ·
StatusBadge (enum→rang) · FormSheet (react-hook-form+Zod, undo toast) ·
ConfirmDialog (maker-checker ogohlantirishi bilan) · MoneyInput/MoneyText
("12 000 000 so'm") · ChartCard (Recharts, ishonch band, bo'sh/yuklanish
holatlari) · EmptyState/ErrorState.

### v1 §4.4. UX qoidalari
1) Jonli hisob — formulali ekranlarda natija real vaqtda (<100ms).
2) 3 klik qoidasi. 3) Jim o'chirmaslik (soft delete). 4) Har hisoblangan
raqam yonida ℹ tooltip (formula kirishlari). 5) Alert = amal (bosilsa
yechim ekraniga). 6) uz-latn, next-intl, dd.mm.yyyy, UZS.

## v1 §5. Modullar spetsifikatsiyasi

### v1 §5.1. M2 — Sarlavha & Metama'lumot
Sahifalar: /titles (DataTable: muqova, sarlavha, mualliflar, format
belgilar, status, sparkline; filtr status/seriya; qator cheklovi);
/titles/new (3 qadamli wizard → DRAFT); /titles/[id] Product 360° tablar:
Umumiy | Formatlar (SKU CRUD, ISBN-13 checksum jonli) | Hissadorlar |
Metama'lumot (Thema/BISAC qidiruvli tanlagich, "AI tasniflash" tugmasi
diff bilan) | Annotatsiya (kanal versiyalari) | ONIX (3.0 preview +
eksport + tarix) | Tarix (audit_log). Holat mashinasi transition service
bilan; orqaga qaytish sabab matni bilan; ⌘K titles tsvector'dan.
API: GET/POST /api/v1/titles, POST /titles/:id/transition,
POST /products, GET /titles/:id/onix?channel=.

### v1 §5.2. M3 — Akvizitsiya & P&L
/acquisitions ro'yxat; /acquisitions/[id] ikki panelli editor: chapda
kirishlar (doimiy xarajat qatorlari, sahifa soni, bir sahifa narxi,
doimiy bosma, adad, sotilish %, chegirma %, royalti %, marja %), o'ngda
jonli natijalar (PC/TC/UC/P_min/RRP katta raqamlar, break-even grafigi,
sezgirlik slayderlari). Ssenariy nusxalash + 2–4 tasini solishtirish.
O'xshash kitob prognozi (3–5 comparable, 12 oylik egri o'rtachasi).
APPROVED → byudjet. Formulalar v1 §6.1, lib/finance.ts, 100% test.

### v1 §5.3. M4 — Ishlab chiqarish
/production: kanban (Reja/Jarayonda/Tekshiruvda/Tayyor) + ro'yxat;
vazifa CRUD, dependsOn, kechikkanlar qizil. /production/print-orders:
holat mashinasi; "Qabul qilish" (haqiqiy adad + ombor) → avtomatik
stock IN (unitCost = haqiqiy PP&B) tranzaksiyada → QoH oshadi.
Reja vs Fakt paneli: farq >10% → notification. Reprint: ROP alertdan
oldindan to'ldirilgan print order (EOQ adad).

### v1 §5.4. M5 — Ombor & Dead-Stock
/inventory: SKU jadvali (QoH/Reserved/Available/On Order/yosh/aylanish/
holat badge). /inventory/movements: jurnal + ADJUST/TRANSFER sabab bilan.
/inventory/dead-stock: sozlama (chegara kunlar 90/120/180, saqlash %,
ROI %), zarar jadvali (C_dead/C_carrying/C_opportunity/JAMI), muzlagan
kapital KpiCard, tasarruf ustasi 6 qadam (narx pasaytirish → to'plam →
qaytarish → ulgurji → xayriya → hisobdan chiqarish; write-down
maker-checker). ABC sahifasi (kumulyativ 80/15/5). ROP monitor va
dead-stock skaner — v1 §6.2–6.3 joblari. /api/v1/jobs/run (admin).

### v1 §5.5. M6 — Sotuv & Marja
/sales/orders + karta (qatorlar, kanal chegirmasi avtomatik, holat
stepper). Holat effektlari: CONFIRMED→Reserved+; SHIPPED→FIFO COGS +
cogsUnit/cmUnit muhrlash; INVOICED→AR; PAID; CANCELLED→band yechish.
/sales/channels (kanal kartalari + oylik CM grafik; sozlamalar yangi
buyurtmaga standart tushadi, eski hujjatlar o'zgarmaydi).
/sales/receivables: AR aging 0-30/31-60/61-90/90+, overdue notification.
/sales/returns: SELLABLE→stock IN; davr sof sotuvini kamaytiradi.

### v1 §5.6. M7 — Huquqlar & Royalti
/contracts + editor: tomonlar, asar-formatlar, tier jadvali (kesishmaslik
validatsiyasi), avans, zaxira %, sub-huquqlar (AUDIO belgisi).
/royalties/runs: davr → dvigatel (v1 §6.5) → preview satrlari (izoh:
qaysi tier, nechta nusxa, asos) → maker-checker tasdiqlash → davr
muhrlanadi → statement PDF'lar. Determinizm majburiy.

### v1 §5.7. M8 — Muallif portali
/portal alohida layout: Umumiy (jami nusxa/daromad, oylik grafik, avans
progress-bar — faqat SENT davrlar), Hisobotlar (PDF/Excel, imzolangan
URL), Kitoblarim. Row-level: contributorId har so'rovda; E2E izolyatsiya.

### v1 §5.8. M9 — Analitika & BI
Materialized view'lar: mv_monthly_sales (oy×SKU×kanal), mv_title_kpi,
mv_ar_aging; tungi refresh + qo'lda. /analytics konstruktor: o'lchov
(tushum/nusxa/CM/royalti) × kesim (asar/seriya/kanal/format/oy) × davr →
pivot + grafik; saqlangan hisobotlar; CSV/Excel eksport. Tayyor: Top-10,
Eng sekin 10, Kanal rentabelligi, Prognoz vs Fakt (MAPE trend),
Dead-stock dinamikasi.

### v1 §5.9. M1 — Boshqaruv paneli
12 ustunli to'r, dnd-kit drag-drop, layout JSONB profilda; vidjetlar
mustaqil server komponentlar (skeleton + ErrorState): KPI kartalar,
12 oylik grafik, ogohlantirishlar (notifications'dan, bosilsa manzilga),
Top-10, kanal donut, kechikkan vazifalar, AR mini. Rol bo'yicha standart
layoutlar seed'da. Ma'lumot faqat view'lardan.

### v1 §5.10. M10 — AI Studio
/ai/forecast (SKU → tarix+3 usul+ansambl grafigi, MAPE jadvali, "Zaxira
qoidasiga qo'llash" ai.apply bilan; MAPE>40% → past ishonch, qo'llash
o'chiq); cold-start ustasi; /ai/pricing (elastiklik, tavsiya, floor
chizig'i, "nega" matni, qabul → narx tarixi); /ai/geo (Claude API:
javob-birinchi annotatsiya 3 uzunlik, Thema/BISAC ishonch % bilan,
schema.org JSON-LD; diff ko'rinish); /ai/audio (TTS adapter, boblar,
navbat, preview; shartnomada AUDIO bo'lmasa blok). Naqsh: tavsiya →
inson tasdig'i → amal.

### v1 §5.11. M11 — Administratsiya
/admin/users (taklif, entityAccess); /admin/roles (matritsa editori,
9 standart rol: Direktor, Akvizitsiya muharriri, Ishlab chiqarish
menejeri, Ombor menejeri, Sotuv menejeri, Buxgalter, Huquqlar menejeri,
Muallif, Administrator); /admin/settings (valyuta/QQS, dead-stock
kunlari, saqlash %, ROI %, Z, tariflar — hammasi tahrirlanadigan);
/admin/integrations (kalitlar shifrlangan, AI health, mappinglar);
/admin/import (CSV shablonlar, validatsiya hisoboti, tranzaksion);
/admin/audit (jurnal, diff).

## v1 §6. Algoritmlar (lib/finance.ts — sof funksiyalar, Decimal)

### v1 §6.1. Tannarx va narxlash yadrosi
```
printCost({fixedPrintCost, pages, perPageCost})
  = fixedPrintCost + pages * perPageCost                  // PC
totalCost({fixedCosts[], printRun, pc}) = sum(fixedCosts) + printRun*pc
unitCost({tc, printRun, sellThroughRate})                 // UC
  assert 0 < sellThroughRate <= 1
  = tc / (printRun * sellThroughRate)
minViablePrice({uc, discountRate, royaltyRate})           // P_min
  denom = 1 - discountRate - royaltyRate; assert denom > 0
  = uc / denom
rrp({uc, discountRate, royaltyRate, targetMargin})
  denom = 1 - discountRate - royaltyRate - targetMargin; assert denom>0
  = roundToPretty(uc / denom)
breakEvenUnits({fixedCosts, price, discountRate, royaltyRate, pc})
  netPerUnit = price*(1-discountRate) - price*royaltyRate - pc
  = ceil(sum(fixedCosts) / netPerUnit)
```
OLTIN TEST: doimiy 12 000 000; 384 sahifa × 95; doimiy bosma 3 000;
adad 3 000; sotilish 80%; chegirma 45%; royalti 10%; marja 20% →
PC = 39 480, UC ≈ 54 350, P_min ≈ 120 778, RRP ≈ 217 400.
Chegara testlari: denom<=0 xato; sellThrough=0 xato.

### v1 §6.2. Dead-stock skaneri (tungi 02:00)
```
job deadStockScan():
  cfg = settings(thresholdDays, carryingRate, expectedROI)
  for sku in activeSKUs:
    age = today - lastSaleDate(sku)
    if age < cfg.thresholdDays: continue
    if isValuableBacklist(sku): continue
    uc = fifoAvgUnitCost(sku)          // v2'da reportCost'ga o'tadi
    dead = qoh(sku) * uc
    carrying = dead * cfg.carryingRate
    opportunity = dead * cfg.expectedROI
    upsert DeadStockFlag(... total = dead+carrying+opportunity)
    notify('OMBOR')
isValuableBacklist(sku):
  cm12 = contributionMargin(sku, 12 oy)
  return cm12 > 0 AND (hasSeasonalPattern(sku) OR turnover > min)
```
OLTIN TEST: 820 × 50 000, saqlash 20%, ROI 25% → jami ≈ 59 450 000.

### v1 §6.3. ROP/SS/EOQ/ABC (tungi 03:00)
```
ropMonitor(): har SKU:
  dAvg = mean(dailySales 90 kun); sigma = stddev
  ss = Z * sigma * sqrt(L);  rop = dAvg*L + ss
  if available < rop: alert('ROP', suggestQty=eoq)
eoq = sqrt(2*D*S / H)   // D yillik, S buyurtma xarajati, H=uc*carrying
abc: yillik tushum DESC kumulyativ: A 0–80% (Z 99%), B 80–95%, C 95–100%
```

### v1 §6.4. CM muhrlash (onOrderShipped)
```
for line: cogs = fifoIssue(productId, qty)
  net = unitPrice*(1-discountRate) - channelFee
  line.cogsUnit = cogs/qty
  line.cmUnit = net - cogsUnit - royaltyEst - shippingPerUnit
```

### v1 §6.5. Royalti dvigateli (determinik)
```
royaltyRun(period): for contract: for (title, format) in scope:
  netUnits = confirmedSales - returns          // muhrlangan davr
  prevCum = cumulativeUnitsBefore(period)
  earned = Σ over tiers: overlap(prevCum, prevCum+netUnits, tier)
           * base(tier.basis: LIST|NET) * tier.rate     // kumulyativ!
  reserveHeld = earned * reserveRate           // 15–20%
  releasedPrev = prevReserve - actualReturnImpact(prevPeriod)
  payableBefore = earned - reserveHeld + releasedPrev
  recoup = min(payableBefore, advanceOutstanding); advance -= recoup
  payable = payableBefore - recoup
  writeStatementLine(..., izoh: qaysi tier, nechta nusxa)
status = DRAFT  // maker-checker
```
Determinizm: run faqat yopilgan davr sotuvlarini oladi; tasdiqdan keyin
o'sha davr tahrirlash taqiqlanadi.

### v1 §6.6. Talab prognozi pipeline
```
/predict {history, horizon}:
  if len >= 18 oy:
    m1 movingAverage(w=3); m2 linearRegression; m3 Prophet; m4 XGBoost(lag)
    scores = backtest(oxirgi 6 oy MAPE)
    forecast = teskariMAPEvazn(m1..m4)
  else:  // COLD-START
    comps = kNN(metadataEmbedding, k=5)
    forecast = normallashgan(comps egri) o'rtachasi * tashqiSignallar
  return {values, low, high, mape}
```
Har oy fakt ↔ forecast → MAPE yoziladi (M9 nazorat).

### v1 §6.7. Dinamik narxlash
```
suggestPrice(sku):
  floor = P_min(sku)     // v2: getDecisionFloor(sku)
  e = elasticity(log-log regressiya)
  p* = argmax over grid(floor..current*1.3, 5%) of p*demand(p,e)
  p* = clamp(p*, floor, contractCaps)
  if |p*-current|/current < 3%: return null
  save PriceRecommendation(rationale)   // inson tasdig'iga
```

## v1 §7. AI qatlamlari
§7.1 FastAPI: POST /predict, /coldstart, /elasticity, GET /health;
modellar on-the-fly fit; Next.js tarixni JSON yuboradi (AI baza ko'rmaydi);
MAPE>40% → past ishonch, avtoqo'llash yo'q; graceful degradation.
§7.2 Claude API (lib/prompts/ versiyalangan, Zod JSON): GEO annotatsiya
(javob-birinchi, 3 uzunlik), Thema/BISAC (ishonch % + asos), schema.org
JSON-LD, dead-stock tavsiyasi; xato/timeout'da bo'sh qaytadi.
§7.3 TTS adapter: synthesize(text, voice, lang); provayder almashinuvchan;
boblarga bo'lish → navbat → preview → yig'ish; AUDIO huquq nazorati.
§7.4 Joriy tartib: AI-1 prognoz (MAPE bazadan 20% yaxshi) → AI-2
dead-stock/narx → AI-3 cold-start → AI-4 GEO+audio.

═══════════════════════════════════════════════════════════
# V2 QISM (yakuniy tizim — uch og'riq to'lqini asosida)
═══════════════════════════════════════════════════════════

## v2 §2. Qabul qilingan qarorlar
1. Doimiy xarajat taqsimoti: NUSXA-KUN (agentlardagi konsignatsiya ham
   kiradi — kitob hali bizniki). Usul settings'da almashtiriladigan.
2. Ichki chegirma BARCHA o'qlarda: qoidalar ustuvorligi PARTNER →
   VOLUME → TITLE → ENTITY → DEFAULT; taklif avtomatik, yakun qo'lda,
   har qatorda MUHRLANADI.
3. Mualliflar: BUYOUT (summa → cost_entries TITLE, M7 hisobsiz) yoki
   ROYALTY (to'liq dvigatel).
4. Bosma FAQAT outsource: partners(PRINTER), valyuta majburiy.
5. Agent motivatsiyasi = shaxsiy chegirma. Bonus moduli YO'Q. KPI:
   yig'ilgan pul (DSO), qaytarishlar, qoldiq yoshi.

## v2 §3. Biznes model
Uch sub'ekt: TASNIM, TAHLIL (ishlab chiqaruvchi), SOTUV_BOLIMI
(distributor). Ichki savdo: asosiy narx − muhrlangan chegirma. Partners
yagona registri (klient/agent/bosmaxona/tashqi nashriyot/yetkazib
beruvchi, rollari bayroqlar). Ombor sub'ektga tegishli, turi:
MAIN/SALES/AGENT (konsignatsiya). Nusxa holatlari: Omborda / Agentda /
Sotilgan / Qaytgan. Pul ikki tomonlama: AR + AP + ichki ledger.
Tashqi nashriyot kitoblari: (a) qayta sotish — bizning zaxira;
(b) komissiya — sotilganda payables ochiladi.

## v2 §4. Ma'lumot modeli delta
- entities(code TASNIM/TAHLIL/SOTUV, name, type PUBLISHER/DISTRIBUTOR)
  — imprints o'rnini bosadi.
- partners(name, roles[] CLIENT/AGENT/PRINTER/EXT_PUBLISHER/SUPPLIER,
  defaultDiscount, creditLimit, paymentTermDays, currency, isBlocked).
- editions(titleId, editionNo, plannedRun, status, notes) — SKU
  editionId bilan bog'lanadi.
- cost_entries(scope TITLE/EDITION/FIXED, entityId, category enum:
  HUQUQ/TARJIMA/TAHRIR/DIZAYN/MUALLIF_BUYOUT/BOSMA/MARKETING_TITLE/
  MARKETING_BRAND/IJARA/OYLIK/KOMMUNAL/BOSHQA, amount, currency, rate,
  amountUZS, date, titleId?, editionId?, campaign?).
- daily_unit_cost(productId, editionId, date, baseUnit, allocFixedCum,
  reportCost, decisionCost, expNetPrice).
- transfer_orders(fromEntityId, toEntityId, status QORALAMA→JO'NATILDI→
  QABUL) + lines(productId, qty, basePrice, discountRate MUHRLANGAN,
  transferPrice).
- discount_rules(scope PARTNER/VOLUME/TITLE/ENTITY/DEFAULT, refId?,
  minQty?, rate, priority).
- leads(source INSTAGRAM/TELEGRAM/..., campaign, contact,
  interestTitleId?, status NEW/CONTACTED/ORDERED/LOST, assigneeId,
  convertedOrderId?, lostReason?).
- payables(partnerId, type COMMISSION_BOOKS/PRINTING/RIGHTS/OTHER,
  amount, currency, dueDate, status).
- payments(direction IN/OUT, method CASH/CARD/BANK, partnerId?,
  entityId, amount, reconStatus PENDING/MATCHED, bankRef?).
- telegram_links(chatId unique, userId, subscriptions).
- O'zgargan: warehouses(+entityId, +type MAIN/SALES/AGENT, +partnerId?);
  contracts(+type BUYOUT/ROYALTY, +buyoutAmount); print_orders
  (+editionId, printerId→partners, +currency/rate); sales_order_lines
  (+deliveryCostUnit); sales_orders(+entityId, +warehouseId);
  users(+entityAccess[]).

## v2 §5. Yangi modullar

### v2 §5.1. M12 — Jonli Tan Narx Dvigateli
Uch qatlam: TITLE (huquq, tarjima, tahrir, dizayn, BUYOUT, kitob-reklama
→ BARCHA nashrlar reja nusxasiga bo'linadi; 2-nashr chiqsa qayta
taqsimlanadi), EDITION (bosma → shu nashr nusxalariga, FIFO asosi),
FIXED (nusxa-kun: oylik ÷ kunlar ÷ shu kungi jami nusxa, konsignatsiya
bilan; sotilmagan nusxada YIG'ILADI).
Sahifalar: /costing (jadval: reportCost, decisionCost, expNet, marja %,
qaytmas nuqtagacha kunlar — rang: >90 yashil / 30–90 sariq / <30 qizil);
/costing/[sku] (IKKI CHIZIQLI grafik: o'suvchi reportCost + pasayuvchi
expNet, kesishish belgisi; qatlamlar donuti; ℹ to'liq hisob); ssenariy
simulyatori (months/units slayderlar, 3/6/9 tugmalar); nashr rejasi
paneli ("2-nashr bossammi?": qoldiq+sur'at+yangi birlik narx+muzlagan
kapital → tavsiya, EOQ bilan).
Qoidalar: reportCost (hamma xarajat — rentabellik) va decisionCost
(sunk'siz — bugungi qaror) doim yonma-yon, hech qachon aralashmaydi;
qaytmas nuqtaga 30 kun qolganda alert; konsignatsiya ham yuk oladi.

### v2 §5.2. M13 — Sub'ektlar va ichki savdo
/transfers (ro'yxat + karta: qatorda kitob, miqdor, asosiy narx, TAKLIF
chegirma manbasi bilan, yakuniy chegirma tahrirlanadigan, transferPrice;
saqlashda MUHRLANADI; P_min buzilsa qizil blok, admin override audit'da);
holat: QABUL → qabul qiluvchida FIFO qatlam transferPrice bilan,
beruvchida OUT. /entities/ledger (sub'ektlararo qoldiq, ichki to'lovlar).
/discount-rules (CRUD + sinov kalkulyatori). suggestDiscount() tashqi
savdoda ham ishlaydi. Nashriyot foydasi transferPrice'da tugaydi, sotuv
bo'limi foydasi undan boshlanadi — M9 shu chegarada.

### v2 §5.3. M14 — CRM-Lidlar
/leads kanban (Yangi→Aloqada→Buyurtma→Yo'qotildi; 24/48 soat javobsiz
sariq/qizil); lid kartasi (izohlar, "Buyurtmaga aylantirish" → M6 chakana,
convertedOrderId; "Yo'qotildi" sabab enum); tez kiritish formasi (⌘K);
/leads/analytics (kampaniya × lidlar/konversiya %/tushum/xarajat/CAC/ROI).
Chakana buyurtmada yetkazish (Pochta/BTS) deliveryCostUnit sifatida CM'da.

### v2 §5.4. M15 — Moliya markazi
/finance (kassalar sub'ekt kesimida, AR/AP jami, ichki ledger, haftalik
pul oqimi); /finance/receivables (aging + kredit limitlar paneli:
limit/ishlatilgan/qolgan/blok); /finance/payables (bosmaxona valyutali,
komissiya, huquq; to'lov OUT bilan yopish); /finance/reconciliation
(kun: chapda PENDING to'lovlar, o'ngda bank CSV/kassa; auto-match
summa+sana+hamkor → MATCHED; qo'lda juftlash; farq hisoboti);
/finance/agents (KPI: sotuv, YIG'ILGAN, DSO, qaytarish %, qoldiq yoshi,
chegirma).

## v2 §6. Mavjud modullarga o'zgarishlar
M2: NASHRLAR tabi; SKU→edition; ownerType OWN/EXTERNAL (EXTERNAL'da
nashr/xarajat tablari yashirin); xarajat mini-paneli.
M3: ssenariy EDITION darajasida; kategoriyalar cost_entries enumidan;
"2-nashr rejimi" (unikal=0).
M4: faqat tashqi bosmaxona, valyuta; FIFO qatlam narxi = FAQAT bosma
(unikal ulush M12'da — ikki marta sanalmaydi).
M5: ko'p sub'ektli + AGENT omborlar; to'rt holat; dead-stock reportCost
bilan (M12 dan keyin).
M6: buyurtmada entity majburiy; chegirma suggestDiscount'dan; kredit
limit CONFIRMED'da; chakanada yetkazish; marketpleys SOF KPI; komissiya
kitob sotuvida payables; royalti bahosi faqat ROYALTY'da.
M7: type BUYOUT (dvigatelsiz, buyoutAmount→cost_entries) / ROYALTY.
M9: hamma hisobotda ENTITY kesimi; yangi "Foyda-Zarar" hisoboti
(Tasnim/Tahlil/Sotuv/Jami, oylik tablar — Foyda_Zarar_2026.html
strukturasida).
M1: yangi vidjetlar — qaytmas nuqta xavfi, limitdan oshganlar,
solishtirish holati, sub'ekt P&L mini.
M10: prognoz→kesishish sanasi bashorati; pricing floor = DECISION cost.
M11: yangi sozlamalar (taqsimot usuli, kurslar, yosh-chegirma zinasi);
import real fayllar formatida (v2 §9).
Bot: yangi komandalar 🔥 Tan narx xavfi, 💳 Qarzlar, 🤝 Agentlar.

## v2 §7. Yangi algoritmlar

### v2 §7.1. Kunlik jonli tan narx (job 01:30)
```
job dailyCosting(date):
  for entity in entities:
    fixedMonth = sum(cost_entries FIXED, entity, joriy oy)
    dailyFixed = fixedMonth / daysInMonth
    totalCopies = sum(QoH barcha omborlar, AGENT BILAN)
    perCopyToday = dailyFixed / max(totalCopies, 1)
    for sku in entitySKUs:
      uniquePerCopy = sum(cost_entries TITLE, title(sku))
                      / sum(plannedRun barcha editions(title))
      # 2-nashr qo'shilsa maxraj o'sadi -> yuk avtomatik kamayadi
      printUnit = fifoAvgUnitCost(sku)
      allocCum = yesterday.allocFixedCum + perCopyToday
      reportCost   = uniquePerCopy + printUnit + allocCum
      decisionCost = printUnit + saqlashKunlik(sku)   # sunk'siz!
      expNet = expectedNetPrice(sku, age(sku))
      write daily_unit_cost(...)
      if daysUntilCross(reportCostTrend, expNetTrend) <= 30:
        alert('QAYTMAS_NUQTA', sku, crossDate)
```
Himoya: bosma FIFO'da, unikal alohida — faqat reportCost'da qo'shiladi,
COGS faqat bosma qatlamdan; hech narsa ikki marta sanalmaydi.
expectedNetPrice(sku, age): kanal chegirmalari + yosh zinasi
(0–90: 0%, 91–180: −15%, 180+: −30% — settings'da tahrirlanadi).

### v2 §7.2. Ssenariy simulyatori
```
simulate(sku, {months, unitsToSell}):
  copiesPath = projectInventory(QoH, unitsToSell, months)
  fixedLoad = Σ kunlar bo'yicha dailyFixedPerCopy
  finalUnitCost = uniquePerCopy + printUnit + fixedLoad
  profit = unitsToSell*expectedNetPrice(o'rtacha yosh)
           - unitsToSell*finalUnitCost
  return {finalUnitCost, profit, breakEvenDay}
```

### v2 §7.3. Chegirma qoidalari dvigateli
```
suggestDiscount(partner|entity, product, qty):
  ustuvorlik: 1.PARTNER 2.VOLUME(qty>=minQty) 3.TITLE 4.ENTITY 5.DEFAULT
  return {rate, source}     # UI'da manba ko'rinadi
  # yakuniy qiymat qo'lda; saqlashda MUHRLANADI; transferPrice >= P_min
```

### v2 §7.4. Agent KPI va CAC
```
agentKPI: sales, collected(payments IN), dso=avgDays(invoice→payment),
  returnsR, stockAge(konsignatsiya); score: collected/dso og'irroq.
campaignCAC = spend(cost_entries MARKETING, campaign)
              / max(leads(campaign, ORDERED).count, 1);  ROI = tushum/spend
```

### v2 §7.5. Solishtirish (reconciliation)
```
dailyRecon(date): sys=payments(PENDING); bank=CSV import + kassa
  auto-match summa+sana+hamkor -> MATCHED; qolgani qo'lda
  kun yopilishi: farq != 0 -> moliya roliga hisobot
```

## v2 §9. Real fayllarni import qilish
Tartib: (1) kirimlar.xlsx — katalog+yetkazib beruvchilar tug'iladi,
FIFO qatlamlari (unitCost = Summa_dona); ustunlar: Sana, Kitoblar,
Miqdor, Narxi, Chegirma, Summa_dona, Umumiy, Yetkazib beruvchi.
(2) Sotuv_2025-2026.xlsx — ustunlar: Sana, Klient, Holat(Ulgurji/
Chakana), Kitoblar, Kirim, Sotuv_narxi, Soni, Chegirma,
Qoshimcha_xarajat, Summa, Foyda → partners avtoyaratish, orders+lines
(kanal Holat'dan, chegirma muhrlanadi, tarixiy COGS=Kirim).
(3) Doimiy xarajatlar qo'lda retrospektiv → keyin M12 backfill.
(4) Foyda_Zarar_2026.html — NAZORAT ETALONI: import to'g'ri bo'lsa M9
"Foyda-Zarar" hisoboti undagi raqamlarga yaqin (jami daromad ~2.64 mlrd
so'm, sof foyda ~735 mln, 27.8%). Kitob nomlari normalizatsiyasi
(lotin/kirill → bitta asar ikki SKU), moslashtirish lug'ati, sinov
rejimi (yozmasdan validatsiya).
