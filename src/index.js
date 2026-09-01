import schedule from "node-schedule";
import { runAstaJob } from "./jobs/astaPlays.job.js";
import { runNanoJob } from "./jobs/nanoFacts.job.js";
import { runCommentResponderJob } from "./jobs/commentResponder.job.js";
import { runReelsPublisherJob } from "./jobs/reelsPublisher.job.js";
import { startTelegramListener } from "./services/telegram.service.js";
import { testSupabaseConnection } from "./services/supabase.service.js";
import { verifyYouTubeConnection } from "./services/youtube.service.js";
import { getTikTokAccessToken } from "./services/tiktok.service.js";
// import { startServer } from "./server.js";

console.log("=========================================================");
console.log("🤖 AI-Driven Facebook, YouTube & TikTok Started 24/7");
console.log("=========================================================");

// Handle global unhandled errors to keep server alive 24/7
process.on("unhandledRejection", (reason) => {
  console.error("[Process] Unhandled Rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("[Process] Uncaught Exception:", err);
});

// Test Supabase Database Connection
testSupabaseConnection().then((connected) => {
  if (connected) {
    console.log("[Boot] 📦 Supabase database active for Reels Queue & Evergreen Archive.");
  } else {
    console.warn("[Boot] ⚠️ Supabase not yet initialized. Please run the SQL schema in Supabase SQL Editor.");
  }
});

// Test YouTube Channel Connection
verifyYouTubeConnection().then((yt) => {
  if (yt.success) {
    console.log(`[Boot] 📺 YouTube Shorts Channel Connected: "${yt.channelTitle}" (${yt.customUrl})`);
  } else {
    console.warn("[Boot] ⚠️ YouTube Channel connection check:", yt.error);
  }
});

// Test TikTok Connection
getTikTokAccessToken().then((token) => {
  if (token) {
    console.log("[Boot] 🎵 TikTok Account Connected & Authorized for Video Publishing.");
  } else {
    console.warn("[Boot] ⚠️ TikTok credentials not fully configured.");
  }
});

// [DISABLED FOR NOW] Express Webhook Server (for Facebook Messenger AI Auto-Reply)
// startServer();

// Start Telegram Queue & 10-Channel Listener in background
startTelegramListener();

// Run posting jobs once immediately on startup safely
runAstaJob().catch((err) => console.error("[Startup] Asta Plays job error:", err.message));
runNanoJob().catch((err) => console.error("[Startup] Nano Facts job error:", err.message));

// Run comment responder once immediately on startup safely
runCommentResponderJob().catch((err) => console.error("[Startup] Comment responder error:", err.message));

// Run Multi-Platform (FB + YouTube + TikTok) Publisher once on startup (after 5s to let Telegram listener sync queue)
setTimeout(() => {
  runReelsPublisherJob().catch((err) => console.error("[Startup] Multi-Platform publisher error:", err.message));
}, 5000);

// Schedule Asta Plays (Text Post) at 1:00 AM, 6:00 AM, 11:00 AM, 4:00 PM, 9:00 PM (Every 5 Hours)
schedule.scheduleJob("0 1,6,11,16,21 * * *", () => {
  console.log("\n[Scheduler] Running Asta Plays job at:", new Date().toLocaleString());
  runAstaJob();
});

// Schedule Nano Facts (Text Post) at 1:00 AM, 6:00 AM, 11:00 AM, 4:00 PM, 9:00 PM (Every 5 Hours)
schedule.scheduleJob("0 1,6,11,16,21 * * *", () => {
  console.log("\n[Scheduler] Running Nano Facts job at:", new Date().toLocaleString());
  runNanoJob();
});

// Schedule Comment Auto-Responder (Fast Polling every 2 minutes with human-paced natural delay)
schedule.scheduleJob("*/2 * * * *", () => {
  runCommentResponderJob();
});

// Schedule Multi-Platform (Facebook Reels + YouTube Shorts + TikTok) Auto-Publisher at 12:00 AM, 4:00 AM, 8:00 AM, 12:00 PM, 4:00 PM, 8:00 PM (Every 4 Hours)
schedule.scheduleJob("0 0,4,8,12,16,20 * * *", () => {
  console.log("\n[Scheduler] Running Multi-Platform (FB + YouTube + TikTok) Auto-Publisher at:", new Date().toLocaleString());
  runReelsPublisherJob();
});
