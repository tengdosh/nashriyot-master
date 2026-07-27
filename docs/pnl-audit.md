# Foyda-Zarar Etalon Auditi — 2026 H1

Sana: 2026-07-27  
Etalon: `docs/Foyda_Zarar_2026.html`  
Haqiqiy: `sotuv.csv` importidan kelgan buyurtmalar (Import kanal, demo seed kirmaydi)

---

## Tekshiruv 1 — Qaysi ma'lumot ishlatildi?

Oldingi audit (2026-07-27 avvalgi versiya) **NOTO'G'RI** edi:  
`mv_monthly_sales` materializatsiyalangan ko'rinishidan foydalanilgan edi —  
bu demo seed (422 buyurtma, ~486 mln) + real import (843 buyurtma, ~804 mln) **aralash** edi.

| Manba | Buyurtmalar | 2026-H1 net tushum |
|---|---|---|
| Demo seed | 422 | ~486,569,030 so'm |
| Real import | 843 | ~804,833,750 so'm |
| **MV jami (eski audit)** | **1265** | **~1,289,034,070 so'm** |

**To'g'ri audit faqat real import ma'lumotlari ustida**: 804,833,750 so'm.

---

## Tekshiruv 2 — CSV to'liqligi va ta'rif muvofiqligi

### 2a. CSV qatorlar soni va importlangan

| Ko'rsatkich | Qiymat |
|---|---|
| CSV jami qatorlar | 1 714 |
| 2025 yil qatorlari | 871 |
| 2026 yil qatorlari | 843 |
| 2026-H1 (yanvar–iyun) | 843 (barchasi H1 ichida) |
| O'tkazib yuborilgan | 1 qator |
| **Muvaffaqiyatli import** | **842–843 qator** |

**O'tkazib yuborilgan 1 qator:** "Keyingi 100 yil" kitobi, 2026-05-03, Chakana holati, `Sotuv_narxi` bo'sh, `Summa = 0` — nol narxli qator import qilinmagan.

### 2b. "Jami daromad" ta'rifi muvofiqligi

| Manba | Formula | Ta'rif |
|---|---|---|
| CSV `Summa` ustuni | `Sotuv_narxi × Soni × (1 − Chegirma/100)` | Chegirmadan keyingi net |
| Tizim DB buyurtmasi | `unitPrice × qty × (1 − discountRate)` | **Bir xil ta'rif** ✓ |
| `mv_monthly_sales.net_revenue` | `unitPrice × (1−discountRate) × (1−feeRate) × qty` | + kanal komissiyasi chegiriladi |
| Etalon HTML "Jami daromad" | `Summa` yig'indisi | Chegirmadan keyingi, kanaldan oldingi |

**Xulosa:** CSV `Summa` va tizim DB ta'riflari bir xil. `mv_monthly_sales` esa qo'shimcha `feeRate` chegiradi — etalon bilan minor farq. Import kanallari `feeRate = 0` bo'lgani uchun import buyurtmalari uchun bu farq yo'q.

### 2c. Qamrov va ikki marta sanash

| Tekshiruv | Natija |
|---|---|
| Etalon davri | Yanvar–Iyun 2026 (H1) |
| Import davri | Yanvar–Iyun 2026 ✓ (843 buyurtmaning barchasi H1 ichida) |
| Etalon sub'ektlar | Tasnim nashriyoti + Tahlil nashriyoti |
| Import sub'ektlar (oldingi xato) | FAQAT Tahlil (entity mapping xatosi, tuzatildi) |
| Ichki transferlar (import, H1) | **0 ta** — ikki marta sanash yo'q ✓ |

**Entity mapping xatosi:** Import service `entity.findFirst({ orderBy: { code: "asc" } })` — alfavit tartibida birinchi PUBLISHER = "Tahlil nashriyoti". Barcha 843 buyurtma, jumladan Tasnim kitoblari ham, Tahlil entityga biriktirilib ketgan.  
**Tuzatish:** Import service yangilangan — `product.title.entityId` orqali har bir kitobning to'g'ri entitysi ishlatiladi (`lib/services/import-service.ts:217`).

---

## Tekshiruv 3 — Oylik farq jadvali (Import-only)

| Oy | Etalon | Import-only (DB) | CSV Summa | Farq | % |
|---|---|---|---|---|---|
| Yanvar | 368,304,000 | 140,899,970 | 140,919,970 | −227,404,030 | −61.7% |
| Fevral | 318,696,000 | 94,044,800 | 94,044,800 | −224,651,200 | −70.5% |
| Mart | 340,678,000 | 145,169,580 | 144,089,580 | −195,508,420 | −57.4% |
| Aprel | 352,613,000 | 165,000,800 | 165,004,800 | −187,612,200 | −53.2% |
| May | 598,791,000 | 136,107,600 | 136,107,600 | −462,683,400 | −77.3% |
| Iyun | 663,909,000 | 123,611,000 | 123,611,000 | −540,298,000 | −81.4% |
| **JAMI** | **2,642,991,000** | **804,833,750** | **803,777,750** | **−1,838,157,250** | **−69.5%** |

---

## Ildiz Sabablari (tartibda)

### 1. CSV to'liqsizligi — asosiy sabab (~69.5% ta'sir)

sotuv.csv da 843 tranzaksiya bor, net summa ~804 mln. Etalon 2,642 mln.  
**CSV real biznesning faqat ~30.5%ini qamrab oladi.**

Qolgan ~1,838 mln so'm (69.5%) CSV eksportga kirmagan:
- Boshqa kanallar (to'g'ridan-to'g'ri sotuv, onlayn, ulgurji partiyalar)
- To'liq eksport qilinmagan davrlar
- Tasnim nashriyoti buyurtmalari alohida eksport bo'lishi mumkin

**Mapping lug'atini to'ldirish va qayta import — bu muammoni hal qilmaydi.**  
Muammo mapping emas, CSV eksportning to'liq emasligi.  
**Yechim: to'liq CSV eksport (barcha kanallar, Tasnim + Tahlil).**

### 2. Entity mapping xatosi — struktura xatosi (tuzatildi)

Avvalgi import: barcha kitoblar "Tahlil nashriyoti" entityga biriktirilib ketgan.  
Etalonda: Tasnim 1,819,448,000 (68.8%) + Tahlil 823,543,000 (31.2%).  
Bu entity-kesimidagi tahlilni buza edi.

**Tuzatildi:** `lib/services/import-service.ts` — har bir buyurtma `product.title.entityId` orqali to'g'ri entityga biriktiriladi. Mavjud import ma'lumotlari qayta import qilinganda to'g'ri entity bilan keladi.

### 3. feeRate farqi — minor (~0% ta'sir import uchun)

`mv_monthly_sales` kanal komissiyasini (feeRate) chegiradi.  
Import kanallari (`Import (Chakana)`, `Import (Ulgurji)`) `feeRate = 0` bilan yaratiladi.  
**Import buyurtmalari uchun bu farq nol** — faqat demo seed va asosiy kanallar uchun ahamiyatli.

---

## Xulosa va Tavsiyalar

| Muammo | Holat | Tavsiya |
|---|---|---|
| Eski audit aralash ma'lumot ishlatdi | Tuzatildi — `pnl-reconcile.tsx` import-only ko'rsatadi | — |
| Demo seed monthlyQty 2x ko'paytirilgan | **Orqaga qaytarildi** — asl qiymatlar tiklandi | Demo seed etalon bilan bog'liq emas |
| Entity mapping xatosi | **Tuzatildi** — import service yangilandi | Yangi importlarda to'g'ri ishlaydi |
| CSV 69.5% to'liq emas | **Hal qilinmagan** — CSV muammo | To'liq CSV eksport talab qilinadi |
| Hisobot formula | To'g'ri — import uchun feeRate=0 | — |

**Keyingi qadam:** To'liq sotuv CSV eksporti (Tasnim + Tahlil, barcha kanallar, H1 2026) yetkazib berilganda, qayta import bajariladi va ushbu audit yangilanadi.
