# Nashriyot-Master — Simulyatsion Demo Dunyo (docs/demo-data.md)

Demo ma'lumot — rejissyorlik qilingan spektakl: har ekran ochilganda
"jonli" holat turishi kerak. Har kitob/agent/to'lov ataylab bitta keys
uchun qurilgan.

## §1. Tamoyillar
1. Har yozuvning maqsadi bor — "to'ldiruvchi" kitob yo'q.
2. Determinizm: seedrandom('nashriyot-master-demo') — har ishga
   tushirishda aynan bir xil dunyo.
3. Real importdan ajratilgan: npm run seed:demo, alohida
   DATABASE_URL_DEMO tavsiya etiladi.
4. 18 oy: 2025-01-01 — 2026-06-30 ("bugun" = 2026-06-30).
5. Raqamlar o'zaro mos: sotuv−qaytarish=ombor kamayishi; sub'ekt
   P&L yig'indisi = umumiy.

## §2. Dunyo sozlamalari

### §2.1. Doimiy xarajatlar (oylik, so'm) — cost_entries(FIXED)
| Modda | Tasnim | Tahlil | Sotuv bo'limi |
|---|---|---|---|
| Ofis ijarasi | 9 000 000 | 6 000 000 | 7 000 000 |
| Xodimlar oyligi | 38 000 000 | 22 000 000 | 28 000 000 |
| Internet/kommunal | 1 800 000 | 1 200 000 | 1 500 000 |
| Brend-marketing | 5 000 000 | 3 000 000 | 2 500 000 |
| JAMI/oy | 53 800 000 | 32 200 000 | 39 000 000 |

Iyul 2025'dan ijara +10% (indeksatsiya — M12 grafikda sinish beradi).

### §2.2. Hamkorlar
- Agentlar (3): **Akmal** — a'lo: DSO 12 kun, qoldiq yoshi 20 kun,
  chegirma 12%. **Bahodir** — muammoli: DSO 55 kun, kredit limit 25 mln,
  aprel 2026'da limitdan oshadi, 10%. **Sardor** — sekin: konsignatsiya
  qoldiq yoshi 95 kun (alert), 11%.
- Ulgurji klientlar (12): 3 distributor + 9 do'kon; to'lov 15–45 kun;
  ikkitasida PARTNER qoidasi (15%, 14%).
- Chakana: Instagram 2 kampaniya + Telegram 1 — jami 120 lid,
  38 konversiya.
- Marketpleys (1): komissiya 12% + yetkazish o'rtacha 6 000/dona.
- Bosmaxonalar (3): Qamar (UZS), Istanbul Print (USD; kurs 12 600 →
  13 100 ikki partiyada), Yoshkuch (UZS).
- Tashqi nashriyot: "Kamolot nashri" — 1 kitob qayta sotish (H7),
  1 kitob komissiya 25% (H8).

### §2.3. Kanal aralashmasi va narx-yosh zinasi
- Dona taqsimoti: agentlar 55% · distributor 20% · chakana 15% ·
  marketpleys 10%.
- Yosh-chegirma zinasi (expectedNetPrice): 0–90 kun 0% · 91–180 −15% ·
  180+ −30%.
- Mavsumiylik: sentyabr ×3.5 (darslik), dekabr ×1.6, yoz ×0.7.

## §3. Kitoblar matritsasi — 35 kitob, 35 keys

### §3.1. Tasnim — 21 kitob
| # | Kitob | Ssenariy | Sozlash |
|---|---|---|---|
| T1 | Sabr sharbati | Bestseller: 1-nashr 3 oyda tugaydi; sen 2025 2-nashr — unikal yuk sinishi (M12 bosh demo) | 1-nashr 5000 (Qamar), 2-nashr 7000; ROYALTY 10%; unikal 28 mln |
| T2 | Tafakkur bog'i | Qaytmas nuqta mart 2026'da kesilgan → dead-stock zanjiri | 3000 adad, ~40 dona/oy; 200+ kun qoldiq |
| T3 | Oila qal'asi | 6 oyda AYNAN break-even — simulyator etaloni | parametrlar simulate() bilan teskari hisoblanadi |
| T4 | Ilm ziyosi | 3-nashr kalkulyatori ochiq | 2-nashr qoldiq 800, EOQ ~2500 |
| T5 | Qalb tozaligi | BUYOUT muallif 7 mln | contracts.type=BUYOUT |
| T6 | Hidoyat yo'li | Royalti tier kesishi 3000 donada | tiers [0-3000:10%, 3000+:12%] |
| T7 | Duolar xazinasi | Avans 12 mln, ~64% qoplangan | ROYALTY |
| T8 | Shukr siri | Qaytarish > zaxira (2025-H2), keyingi davr korreksiyasi | reserve 15%, dekabr qaytarishlari |
| T9 | Ziyo qissasi (lotin) | Bitta asar — ikki SKU (T10 bilan) | bir title, ikki product |
| T10 | Ziyo qissasi (kirill) | T9 jufti, sekinroq | — |
| T11 | Zafar tongi | Valyuta: Istanbul Print, ikki USD partiya (12 600 / 13 100) — FIFO qatlamlari har xil so'mda | AP valyutali |
| T12 | Aqida darsligi | Mavsumiy ×3.5 + avgust ROP trigger | Prophet topadi; Z=1.65 |
| T13 | Nur qissasi | Cold-start: may 2026 chiqqan, 2 oy tarix | coldstart yo'li (T1,T5 o'xshash) |
| T14 | Hikmat javohiri | Ko'p format + AUDIO huquqli — audio pipeline | 3 SKU |
| T15 | Sukunat kuchi | AUDIO huquq YO'Q — blok demo | — |
| T16 | Bahor nafasi | Ishlab chiqarishda: Gantt 5 vazifa (1 kechikkan), sotuv yo'q | faqat M4 |
| T17 | Yoshlik daftari | REVIEW holati — workflow demo | — |
| T18 | Eski durdona | OUT_OF_PRINT arxiv | — |
| T19 | Safar esdaliklari | Reja vs fakt bosma +15% → alert | M4 variance |
| T20 | Ummon durlari | ABC-A: tushum yetakchisi, Z=2.33 | — |
| T21 | Kichik risola | ABC-C: POD tavsiyasi; backlist himoyasiga TUSHMAYDI (CM manfiy) | — |

### §3.2. Tahlil — 14 kitob
| # | Kitob | Ssenariy | Sozlash |
|---|---|---|---|
| H1 | Moliyaviy savodxonlik | Kampaniya "Mart-2026" ROI 4.2x, CAC 18 000 | 60 lid, 26 konversiya |
| H2 | Startap yo'li | Kampaniya "May-2026" ROI 0.6x, CAC 95 000 | 40 lid, 5 konversiya |
| H3 | Iqtisod asoslari | Marketpleys tuzog'i: nominal foydali, sof CM manfiy | 70% marketpleys |
| H4 | Muzokara san'ati | Chakana yetkazish keysi (BTS 18 000/buyurtma) | 60% chakana |
| H5 | Lider daftari | Sardorda 250 dona 95 kun — konsignatsiya alerti | AGENT ombor |
| H6 | Vaqt boshqaruvi | Qaytarish 12% (8% SELLABLE, 4% DAMAGED) | — |
| H7 | Biznes hikmatlari | Tashqi — qayta sotish (Kamolot) | OWN=false |
| H8 | Iqtisodiy tahlil | Tashqi — komissiya 25%: sotuvda payables ochiladi | COMMISSION kirim |
| H9 | Boylik psixologiyasi | Bahodir aprel 2026 limitdan oshadi → blok → ochish | limit 25 mln |
| H10 | Sotuv sirlari | PARTNER 15% qoidasi transferda | — |
| H11 | Marketing 101 | VOLUME ≥50 → 12% triggeri | — |
| H12 | Tejamkorlik | P_min bloki: 30% taklif polni buzadi | past marja |
| H13 | Soliq qo'llanmasi | 2026-H1 royalti davrida NOL sotuv | ROYALTY |
| H14 | Investitsiya alifbosi | 15-iyun solishtirishda 1 nomuvofiq bank yozuvi | recon farqi |

## §4. Vaqt chizig'i
| Davr | Hodisalar |
|---|---|
| Yan–Apr 2025 | Backlist 20 kitob sotuvda; doimiy xarajatlar boshlanadi; birinchi konsignatsiyalar |
| May 2025 | T1 1-nashri (5000); T11 birinchi USD partiya (12 600) |
| Iyul 2025 | Ijara +10% |
| Avg 2025 | T12 ROP trigger → reprint |
| Sen 2025 | Darslik cho'qqisi ×3.5; T1 2-nashri (7000); 2025-H1 royalti run SENT |
| Dek 2025 | ×1.6; T8 katta qaytarishlar; yilning eng baland oyi |
| Yan 2026 | 2025-H2 run (T8 korreksiyasi); T11 ikkinchi partiya (13 100) |
| Mar 2026 | T2 qaytmas nuqtani kesadi; H1 kampaniyasi |
| Apr 2026 | H9/Bahodir limit → blok → ochish; Sardor 90+ kun alerti |
| May 2026 | T13 chiqadi; H2 kampaniyasi |
| 15-Iyun 2026 | H14 solishtirish nomuvofiqligi |
| 30-Iyun 2026 | 2026-H1 run QORALAMA (maker-checker kutmoqda); barcha alertlar jonli |

## §5. Qabul tekshiruvi (seed assertlari shulardan)
| Ekran | Kutilgan holat |
|---|---|
| /dashboard | ≥6 alert: ROP tarixi, qaytmas nuqta (T2), limit (Bahodir), konsignatsiya (Sardor), xarajat farqi (T19), royalti tasdiq kutmoqda |
| /costing | T2 qizil; 2–3 sariq; T1 kartasida 2-nashr sinishi |
| /costing/T3 | Simulyator 6 oy → foyda ≈ 0 |
| dead-stock | T2 to'liq zarar bilan; T21 himoyada EMAS |
| /transfers | H10 15%, H11 12%, H12 P_min blok urinishi audit'da |
| /finance/agents | Akmal yashil / Bahodir qizil / Sardor sariq |
| /finance/reconciliation 15.06 | 1 MATCHED bo'lmagan yozuv |
| /finance/payables | Istanbul Print (USD), Kamolot komissiya |
| /leads/analytics | 4.2x yashil, 0.6x qizil |
| /royalties | 2 SENT + 1 QORALAMA; T6 ikki tier izohi; T7 avans 64%; H13 nol satri |
| /ai/forecast | T12 mavsumiy topilgan; T13 coldstart; T2 kesishish bashorati |
| Foyda-Zarar | sub'ekt yig'indisi = umumiy; dekabr eng baland |
| /portal (T7 muallifi) | faqat o'z kitoblari; avans 64%; SENT statementlar |
| Bot /menu | KPI, 🔥 (T2), 💳 (Bahodir) to'g'ri raqam |
