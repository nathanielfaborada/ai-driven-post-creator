import "dotenv/config";
import axios from "axios";

const botToken = process.env.TELEGRAM_BOT_TOKEN;

if (!botToken) {
  console.error("❌ Missing TELEGRAM_BOT_TOKEN in .env file!");
  process.exit(1);
}

const tgClient = axios.create({
  baseURL: `https://api.telegram.org/bot${botToken}`,
  timeout: 35000,
});

console.log("================================================================");
console.log("🤖 TELEGRAM CHANNEL ID LISTENER STARTED");
console.log("================================================================");
console.log("👉 Send a test message or post in each of your 10 Telegram channels now.");
console.log("👉 The bot will capture the Channel Name and Chat ID automatically!\n");

const discoveredChannels = new Map();
let offset = 0;

async function listen() {
  while (true) {
    try {
      const res = await tgClient.post("/getUpdates", {
        offset: offset + 1,
        timeout: 20,
        allowed_updates: ["channel_post", "edited_channel_post", "message"],
      });

      const updates = res.data?.result || [];

      for (const update of updates) {
        offset = update.update_id;

        const post = update.channel_post || update.edited_channel_post || update.message;
        if (!post) continue;

        const chat = post.chat;
        if (!chat) continue;

        const chatId = String(chat.id);
        const title = chat.title || chat.username || chat.first_name || "Unknown";
        const type = chat.type || "unknown";
        const text = post.text || post.caption || (post.video ? "[Video Uploaded]" : "[Message]");

        if (!discoveredChannels.has(chatId)) {
          discoveredChannels.set(chatId, { title, type });

          console.log("----------------------------------------------------------------");
          console.log(`✅ [FOUND NEW CHANNEL #${discoveredChannels.size}]`);
          console.log(`📌 Title:     "${title}"`);
          console.log(`🆔 Chat ID:   ${chatId}`);
          console.log(`📂 Type:      ${type}`);
          console.log(`💬 Message:   ${text}`);
          console.log("----------------------------------------------------------------\n");

          printEnvSummary();
        } else {
          console.log(`ℹ️ [Update from "${title}" (${chatId})]: ${text}`);
        }
      }
    } catch (err) {
      if (err.code !== "ECONNABORTED" && err.response?.status !== 408) {
        console.error("⚠️ Polling error:", err.response?.data || err.message);
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }
}

function printEnvSummary() {
  console.log("\n================ CURRENT DISCOVERED LIST ================");
  for (const [id, info] of discoveredChannels.entries()) {
    console.log(`TG_CHANNEL_${info.title.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_ID=${id}  # "${info.title}"`);
  }
  console.log("=========================================================\n");
}

listen();
