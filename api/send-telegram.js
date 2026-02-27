const TelegramBot = require("node-telegram-bot-api");

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_SECRET = process.env.TELEGRAM_SECRET;

if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_SECRET) {
  throw new Error("TELEGRAM_BOT_TOKEN / TELEGRAM_SECRET 이 설정되어 있어야 합니다.");
}

// Vercel의 Serverless Function 엔트리포인트
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.statusCode = 405;
    return res.json({ ok: false, error: "Method Not Allowed" });
  }

  const { secret, chatId, text } = req.body || {};

  if (secret !== TELEGRAM_SECRET) {
    res.statusCode = 401;
    return res.json({ ok: false, error: "Unauthorized" });
  }

  if (!chatId || !text) {
    res.statusCode = 400;
    return res.json({ ok: false, error: "chatId and text are required" });
  }

  try {
    const sent = await bot.sendMessage(chatId, text);
    return res.json({ ok: true, messageId: sent.message_id });
  } catch (err) {
    console.error("Vercel send-telegram error:", err);
    res.statusCode = 500;
    return res.json({ ok: false, error: String(err.message || err) });
  }
};

