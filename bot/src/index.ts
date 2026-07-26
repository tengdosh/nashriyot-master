import { Bot, InlineKeyboard } from "grammy";
import { isReportName, splitMessage, type ReportName } from "@/lib/reports-catalog";
import { renderReport } from "@/lib/bot-format";
import * as api from "./api";
import { answerQuestion, aiEnabled } from "./ai";

/**
 * Read-only Telegram report assistant (spec §5). Long polling. Every number
 * comes from the reports API; the bot never touches the DB and never writes.
 * Without TELEGRAM_BOT_TOKEN it idles (no crash-loop under restart policies).
 */

const AI_DAILY_LIMIT = Number(process.env.BOT_AI_DAILY_LIMIT ?? 50);
const CACHE_TTL_MS = 10 * 60 * 1000;

// In-memory guards (MVP; spec mentions settings-backed limits — acceptable here).
const aiUsage = new Map<string, { day: string; count: number }>();
const cache = new Map<string, { text: string; at: number }>();

function underDailyLimit(chatId: string): boolean {
  const day = new Date().toISOString().slice(0, 10);
  const u = aiUsage.get(chatId);
  if (!u || u.day !== day) {
    aiUsage.set(chatId, { day, count: 1 });
    return true;
  }
  if (u.count >= AI_DAILY_LIMIT) return false;
  u.count += 1;
  return true;
}

function menuKeyboard(menu: api.Menu): InlineKeyboard {
  const kb = new InlineKeyboard();
  menu.forEach((m, i) => {
    kb.text(`${m.icon} ${m.label}`, `r:${m.name}`);
    if (i % 2 === 1) kb.row();
  });
  return kb;
}

function startBot(token: string) {
  const bot = new Bot(token);

  const reply = async (chatId: number, text: string, extra?: Parameters<typeof bot.api.sendMessage>[2]) => {
    for (const chunk of splitMessage(text)) await bot.api.sendMessage(chatId, chunk, extra);
  };

  bot.command("start", async (ctx) => {
    await ctx.reply(
      "Assalomu alaykum! Men nashriyot hisobot yordamchisiman (faqat o'qiyman).\n\n" +
        "Ulanish uchun platformada Profil sahifasidan kod oling va yuboring:\n" +
        "`/ulash 123456`\n\nSo'ng /menu buyrug'i bilan hisobotlarni ko'ring.",
      { parse_mode: "Markdown" },
    );
  });

  bot.command("ulash", async (ctx) => {
    const code = (ctx.match ?? "").trim();
    if (!/^\d{6}$/.test(code)) {
      await ctx.reply("Kodni shunday yuboring: /ulash 123456");
      return;
    }
    const r = await api.link(String(ctx.chat.id), code);
    await ctx.reply(r.ok ? "✅ Muvaffaqiyatli ulandingiz. /menu ni bosing." : `❌ ${r.error ?? "Ulash amalga oshmadi"}`);
  });

  bot.command("uzish", async (ctx) => {
    const removed = await api.unlink(String(ctx.chat.id));
    await ctx.reply(removed ? "Bog'lam o'chirildi." : "Bu chat ulanmagan edi.");
  });

  bot.command("obuna", async (ctx) => {
    const id = await api.getIdentity(String(ctx.chat.id));
    if (!id) return void ctx.reply("Avval /ulash orqali ulaning.");
    const ok = await api.subscribe(String(ctx.chat.id), { daily: true, events: ["ROP", "DEAD_STOCK", "AR_OVERDUE"] });
    await ctx.reply(ok ? "🔔 Muhim push xabarlariga obuna bo'ldingiz." : "Obuna amalga oshmadi.");
  });

  bot.command("menu", async (ctx) => {
    const id = await api.getIdentity(String(ctx.chat.id));
    if (!id) return void ctx.reply("Avval /ulash orqali ulaning.");
    if (id.menu.length === 0) return void ctx.reply("Sizda hisobot ko'rish ruxsati yo'q.");
    await ctx.reply("Hisobotni tanlang" + (aiEnabled() ? " yoki erkin savol yozing:" : ":"), {
      reply_markup: menuKeyboard(id.menu),
    });
  });

  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    await ctx.answerCallbackQuery();
    if (!data.startsWith("r:")) return;
    const name = data.slice(2);
    if (!isReportName(name)) return;

    const chatId = ctx.chat?.id;
    if (chatId == null) return;
    const id = await api.getIdentity(String(chatId));
    if (!id) return void ctx.reply("Avval /ulash orqali ulaning.");

    const r = await api.runReport(id.userId, name);
    if (r.error) return void reply(chatId, `❌ ${r.error}`);
    await reply(chatId, renderReport(name as ReportName, r.data, r.generatedAt), { parse_mode: "Markdown" });
  });

  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text;
    if (text.startsWith("/")) return; // unknown command
    const chatId = ctx.chat.id;
    const id = await api.getIdentity(String(chatId));
    if (!id) return void ctx.reply("Avval /ulash orqali ulaning. /start");

    if (!aiEnabled()) return void ctx.reply("Erkin savol hozircha o'chirilgan. /menu dan hisobot tanlang.");
    if (!underDailyLimit(String(chatId))) {
      return void ctx.reply("Bugungi AI so'rovlar chegarasi tugadi. Ertaga urinib ko'ring yoki /menu dan foydalaning.");
    }

    const key = `${chatId}:${text.toLowerCase().trim()}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return void reply(chatId, hit.text);

    await ctx.replyWithChatAction("typing");
    const answer = await answerQuestion(text, id);
    if (!answer) return void ctx.reply("Hozircha javob berolmadim. /menu dan tayyor hisobotni tanlang.");
    cache.set(key, { text: answer, at: Date.now() });
    await reply(chatId, answer);
  });

  // Push poller (playbook §5.2): fetch pending notifications per chat, send once.
  const PUSH_INTERVAL_MS = Number(process.env.BOT_PUSH_INTERVAL_MS ?? 120_000);
  const pushedIds = new Set<string>();
  let pushSince = new Date().toISOString();
  async function pollPushes() {
    try {
      const chats = await api.getPushes(pushSince);
      pushSince = new Date().toISOString();
      for (const c of chats) {
        for (const n of c.notifications) {
          if (pushedIds.has(n.id)) continue;
          pushedIds.add(n.id);
          await reply(Number(c.chatId), n.text, { parse_mode: "Markdown" });
        }
      }
      if (pushedIds.size > 5000) pushedIds.clear(); // bound memory
    } catch (err) {
      console.error("[bot] push xato:", err);
    }
  }
  if (PUSH_INTERVAL_MS > 0) setInterval(pollPushes, PUSH_INTERVAL_MS);

  bot.catch((err) => console.error("[bot] xato:", err));
  bot.start({ onStart: (me) => console.log(`[bot] @${me.username} ishga tushdi (long polling).`) });
}

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) {
  console.log("[bot] TELEGRAM_BOT_TOKEN yo'q — kutish rejimida (token berilgach qayta ishga tushiring).");
  setInterval(() => {}, 1 << 30);
} else {
  startBot(TOKEN);
}
