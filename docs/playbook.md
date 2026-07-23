# Nashriyot-Master — Bot Playbook (docs/playbook.md)

Bot — Telegram'da ishlaydigan, FAQAT O'QIYDIGAN hisobot yordamchisi.
Vazifasi: platformadagi ma'lumotdan tushunarli o'zbekcha hisobot chiqarib
berish — tayyor komandalar orqali ham, erkin savolga javoban ham.
Bot hech qachon ma'lumot yozmaydi, o'zgartirmaydi, tasdiqlamaydi.

## §5.1. Texnik qarorlar

| Savol | Qaror | Asos |
|---|---|---|
| Freymvork | grammY (TypeScript) | Platforma bilan bir til; telegram_links va RBAC helper'lari qayta ishlatiladi |
| Joylashuv | Monorepo ichida `bot/`, alohida Docker service | Bitta repo, bitta compose; mustaqil restart |
| Ulanish | Long polling (MVP) | Webhook uchun ochiq HTTPS kerak; polling ichki serverda darhol ishlaydi |
| Ma'lumot manbai | FAQAT `/api/v1/reports/*` endpointlari | Bot bazaga bevosita ulanmaydi — RBAC/row-level himoya bir joyda |
| AI roli | Claude API tool-use: funksiya TANLAYDI, SQL YOZMAYDI | Model faqat oq ro'yxatdagi hisobot funksiyalarini parametrlari bilan chaqiradi |
| Kirish | Bir martalik kod bilan hisob ulash + platforma RBAC ko'chishi | Telegram ID o'z-o'zidan ishonchli emas |

## §5.2. Foydalanuvchi tajribasi

- Komandalar: /start, /ulash <kod>, /menu, /obuna, /uzish.
- Menyu tugmalari: 📊 Sotuv · 📦 Ombor · 🧊 Dead-stock · 👑 Royalti ·
  📈 KPI · 🔥 Tan narx xavfi · 💳 Qarzlar · 🤝 Agentlar · ❓ Erkin savol
  (ruxsatga qarab filtrlangan).
- Erkin savol: "O'tgan oy qaysi kanal eng ko'p CM berdi?" — Claude savolni
  tegishli hisobot funksiyasiga aylantiradi, ma'lumot olib, 3–8 jumlalik
  tahliliy matn yozadi; oxirida manba qatori.
- Push xabarlar: ROP, yangi dead-stock, QAYTMAS NUQTA, limit oshishi,
  muddati o'tgan AR — obuna bo'lgan tegishli rollarga.
- Formatlash: raqamlar "12 000 000 so'm", sanalar dd.mm.yyyy; 4096
  belgidan uzun xabar bo'linadi; sotuv trendi PNG grafik
  (chartjs-node-canvas).

## §5.3. Xavfsizlik qoidalari (buzilmas)

1. Bot service-token bilan faqat reports.* endpointlariga kiradi —
   yozuvchi API'larga tokeni yetmaydi (token scope; boshqa route 401).
2. Har so'rovda bog'langan foydalanuvchi ruxsatlari tekshiriladi:
   reports.read yo'q bo'lsa — muloyim rad; entity cheklovi hisobot
   parametrlariga majburan qo'shiladi.
3. Claude'ga xom baza yo'li berilmaydi: faqat funksiya katalogi.
   System promptda qat'iy: "faqat berilgan ma'lumotdagi raqamlarni
   ishlat; yetishmasa 'ma'lumot yetarli emas' de; taxmin taqiqlanadi".
4. Xarajat nazorati: har chat uchun kunlik AI so'rov limiti (settings),
   bir xil savol+parametr 10 daqiqalik keshda.

## Hisob ulash oqimi

Platformada profil sahifasida "Telegram ulash" — 6 xonali bir martalik
kod (bazada hash, 10 daqiqa amal). Botda `/ulash 123456` →
`/api/v1/telegram/link` kodni tekshiradi → telegram_links {chatId, userId}.
Ulanmagan chat hech qanday ma'lumot olmaydi. /uzish bog'lamni o'chiradi.

## Hisobot API katalogi (Task "Bot: hisobot API" da quriladi)

| Endpoint | Parametrlar | Qaytaradi |
|---|---|---|
| sales-summary | davr, kanal?, entity? | jami tushum/nusxa/CM, kanal taqsimoti, top-5 |
| inventory-status | entity? | umumiy qiymat, ROP ro'yxati |
| dead-stock | — | muzlagan kapital, top-10 zarar |
| royalty-liability | — | joriy davr majburiyati, tasdiq kutayotgan runlar |
| ar-aging | — | qarz aging + limitdan oshganlar |
| top-titles | o'lchov, n | reyting |
| kpi-digest | — | kunlik ko'rsatkichlar |
| costing-risk | — | qaytmas nuqtaga <30 kun kitoblar, kesishish sanalari |
| agents-kpi | — | agent: sotuv, yig'ilgan, DSO, qaytarish %, qoldiq yoshi |

Javob formati: `{ data, generatedAt, params }`. Auth: sessiya+reports.read
YOKI Bearer REPORTS_API_TOKEN (+userId majburiy, o'sha foydalanuvchi
ruxsat/entity cheklovi qo'llanadi).
