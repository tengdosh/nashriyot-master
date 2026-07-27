# Foyda-Zarar Etalon Auditi (2026 H1)

Tayyorlangan: 2026-07-27
Manba: `Foyda_Zarar_2026.html` (etalon) va `mv_monthly_sales` materializatsiyalangan ko'rinishi (haqiqiy)

---

## Etalon vs Haqiqiy: Oylik taqqoslash

| Oy      | Etalon (so'm)     | Haqiqiy (so'm)  | Farq (so'm)       | % Farq |
|---------|-------------------|-----------------|-------------------|--------|
| 2026-01 | 368 304 000       | 224 584 905     | -143 719 095      | -39.0% |
| 2026-02 | 318 696 000       | 179 372 065     | -139 323 935      | -43.7% |
| 2026-03 | 340 678 000       | 223 657 075     | -117 020 925      | -34.4% |
| 2026-04 | 352 613 000       | 255 960 990     | -96 652 010       | -27.4% |
| 2026-05 | 598 791 000       | 223 880 975     | -374 910 025      | -62.6% |
| 2026-06 | 663 909 000       | 181 578 060     | -482 330 940      | -72.7% |
| **JAMI**| **2 642 991 000** | **1 289 034 070**| **-1 353 956 930**| **-51.2%** |

### Etalon nashriyotlar kesimida (Tasnim + Tahlil)

| Oy      | Tasnim            | Tahlil          | Jami              | Xarajat     | Sof Foyda    | Marja  |
|---------|-------------------|-----------------|-------------------|-------------|--------------|--------|
| 2026-01 | 223 341 000       | 144 963 000     | 368 304 000       | 39 633 029  | 149 637 471  | 40.6%  |
| 2026-02 | 203 009 000       | 115 687 000     | 318 696 000       | 110 736 205 | 52 273 795   | 16.4%  |
| 2026-03 | 221 656 000       | 119 022 000     | 340 678 000       | 151 920 288 | 28 817 712   | 8.5%   |
| 2026-04 | 175 099 000       | 177 514 000     | 352 613 000       | 56 212 582  | 138 624 918  | 39.3%  |
| 2026-05 | 426 387 000       | 172 404 000     | 598 791 000       | 102 009 000 | 187 263 500  | 31.3%  |
| 2026-06 | 569 956 000       | 93 953 000      | 663 909 000       | 136 072 400 | 178 263 600  | 26.9%  |
| **JAMI**| **1 819 448 000** | **823 543 000** | **2 642 991 000** | **596 583 504** | **734 880 996** | **27.8%** |

---

## Ildiz Sabablari Tahlili

### Sabab 1 — sotuv.csv faqat bitta nashriyot (Tasnim) ma'lumotlarini o'z ichiga oladi

CSV faylidagi 1 714 qatorning barchasi `ent-tasnim` nashriyotiga tegishli.
Tahlil nashriyotining savdo ma'lumotlari (etalon bo'yicha 823 543 000 so'm yoki
umumiy etalon tushumning **31.2%**i) umuman import qilinmagan.

Bundan tashqari, mavjud 1 714 qator ham etalon bilan mos emas — bu qolgan
farqning manbasi hisoblanadi.

**Miqdoriy ta'sir:** MV da Tahlil uchun `net_revenue = 0`, ya'ni
~823 mln so'm yetishmayapti.

### Sabab 2 — Demo seed kichik hajm (~48.8%)

`prisma/seed-demo.ts` dagi `monthlyQty` qiymatlari etalon savdo hajmining
taxminan yarmidir. Masalan:

| Kitob | Mavjud monthlyQty | Kerakli monthlyQty |
|-------|-------------------|--------------------|
| T20   | 556               | 1 200              |
| H1    | 95                | 420                |
| H2    | 57                | 250                |
| H9    | 71                | 310                |

Demo seed qayta ishlatilganda chiqadigan umumiy tushum etalon summasidan
~2.1 marta kichik bo'ladi — bu tuzatish muammosi bo'lib, `npm run seed:demo`
yangilangan qiymatlar bilan qayta ishlatilganda hal bo'ladi.

**Miqdoriy ta'sir:** Seed hajmi kichikligi sababli ~530 mln so'm yetishmayapti
(Tasnim qismida).

### Sabab 3 — mv_monthly_sales kanal to'lovini (feeRate) chegiradi

`mv_monthly_sales` materializatsiyalangan ko'rinishi `net_revenue` ni
**kanal to'lovini ayirib** ko'rsatadi (marketplace komissiyasi, agent chegirmasi).
Etalon `Foyda_Zarar_2026.html` esa **gross tushum** (barcha chegirmalardan
oldingi) raqamlarni aks ettiradi.

Bu metodologik farq taqqoslashda qo'shimcha -5% dan -15% gacha og'ish beradi
va sof matematik hisob-kitob bilan bartaraf bo'lmaydi.

**Miqdoriy ta'sir:** Mavjud seed hajmida taxminan 80–150 mln so'mlik metodologik
farq (gross vs net).

---

## Tuzatish Yo'li

### 1. sotuv.csv ni to'ldirish — har ikkala nashriyot

Tahlil nashriyoti (ent-tahlil) savdo ma'lumotlarini 2026 H1 davri uchun
CSV formatida tayyorlab, M19 import dvijkasi (`lib/import-service.ts`) orqali
yuklash kerak. Import vaqtida:

- `entityId` kolonnasi `ent-tahlil` ko'rsatilishi shart
- Mavjud Tasnim CSV faylining to'liqligi ham tekshirilishi kerak

### 2. seed-demo.ts monthlyQty qiymatlarini yangilash

Quyidagi o'zgarishlar `prisma/seed-demo.ts` fayliga kiritilishi lozim:

```
T20: 556 → 1200    T1: 162 → 350     T6: 120 → 260
T7: 142 → 300      T5: 153 → 330     T12: 105 → 220
T11: 110 → 240     T14: 74 → 160     T15: 95 → 200
T9: 86 → 180       T21: 18 → 40
H1: 95 → 420       H2: 57 → 250      H5: 44 → 190
H8: 46 → 200       H9: 71 → 310
```

`npm run seed:demo` qayta ishlatilganda umumiy tushum ~2.3–2.5 mlrd
so'mga yaqinlashadi.

### 3. Metodologiya muvofiqligi

Etalon hisob-kitobi gross asosida ekanligini aniqlash va agar taqqoslash
uchun zarur bo'lsa, `mv_monthly_sales` dagi `net_revenue` ni gross
versiyasi bilan to'ldirish yoki alohida `gross_revenue` ustunini qo'shish.

Muqobil: etalon raqamlarni ham net (chegirma va komissiyalarni ayirgandan
keyingi) asosda qayta hisoblash.
