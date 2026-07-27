# 10 Daqiqalik Demo Ssenariyi

**Foydalanuvchi:** `director@tasnim.uz` / `Parol123!`
**URL:** `http://localhost:3000`

## 1. Boshqaruv paneli (1 daqiqa)
- `/dashboard` sahifasini oching
- KPI kartochkalarini ko'ring (jami savdo, sof foyda, aktiv sarlavhalar)
- Vidjetlarni suring (drag & drop)

## 2. Sarlavha yaratish (2 daqiqa)
- `/titles` → "Yangi sarlavha" tugmasi
- "Baxt kitob" nomli sarlavha kiriting, DRAFT saqlaNG
- Yangi sarlavhani REVIEW ga o'tkazing

## 3. P&L Stsenariy (2 daqiqa)
- `/acquisitions` → mavjud ssenariiyni oching
- "2-nashr" toggle yoqing — RRP pastga tushadini ko'ring
- Ssenariyni nusxa oling

## 4. Savdo buyurtmasi (2 daqiqa)
- `/sales` → "Yangi buyurtma"
- "Saodatli oila bayoni" 10 dona, chakana narx
- Buyurtmani tasdiqlang (SHIPPED)

## 5. Ombor holati (1 daqiqa)
- `/inventory` sahifasiga o'ting
- QoH, Agentda, Sotilgan ustunlarini ko'ring
- Dead-stock belgisini (sariq) qidiring

## 6. Analitika (1 daqiqa)
- `/analytics` → Foyda-Zarar jadvalini oching
- Etalon vs Haqiqiy panelini ko'ring
- Constructor da "Oy × Kanal" kesimini quring

## 7. Royalti (30 soniya)
- `/royalties` → mavjud run ni oching
- Maker-checker xabarini ko'ring

## 8. AI Studio (30 soniya)
- `/ai` → narx prognozini ishlaNG
- Dinamik narx tavsiyasini ko'ring

## Demo dunyo ma'lumotlari
Barcha ma'lumotlar `npm run seed:demo` orqali yuklanadi.
Kitoblar: Tasnim (15 sarlavha) + Tahlil (6 sarlavha)
Savdo: 2025-02 dan 2026-06 gacha
Foydalanuvchilar: 5 ta (director, editor, warehouse, contributor, sales)
