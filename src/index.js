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
console.log("[Engine] AI-Driven Facebook, YouTube and TikTok Engine Started 24/7");
console.log("=========================================================");

// Keep the bot running 24/7 even if an unexpected error happens
process.on("unhandledRejection", (reason) => {
  console.error("[Process] Unhandled Rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("[Process] Uncaught Exception:", err);
});

// Check if our Supabase database is online and ready
testSupabaseConnection().then((connected) => {
  if (connected) {
    console.log("[Boot] [INFO] Supabase database active for Reels Queue and Evergreen Archive.");
  } else {
    console.warn("[Boot] [WARN] Supabase not yet initialized. Please run the SQL schema in Supabase SQL Editor.");
  }
});

// Check if YouTube Shorts account is connected
verifyYouTubeConnection().then((yt) => {
  if (yt.success) {
    console.log(`[Boot] [INFO] YouTube Shorts Channel Connected: "${yt.channelTitle}" (${yt.customUrl})`);
  } else {
    console.warn("[Boot] [WARN] YouTube Channel connection check:", yt.error);
  }
});

// Check if TikTok account is connected
getTikTokAccessToken().then((token) => {
  if (token) {
    console.log("[Boot] [INFO] TikTok Account Connected and Authorized for Video Publishing.");
  } else {
    console.warn("[Boot] [WARN] TikTok credentials not fully configured.");
  }
});

// Webhook server for Facebook Messenger (turned off for now)
// startServer();

// Listen for new video uploads from Telegram channels in the background
startTelegramListener();

// Post right away when the server boots up so we do not have to wait for the first timer
runAstaJob().catch((err) => console.error("[Startup] Asta Plays job error:", err.message));
runNanoJob().catch((err) => console.error("[Startup] Nano Facts job error:", err.message));

// Check and reply to new Facebook comments right away on startup
runCommentResponderJob().catch((err) => console.error("[Startup] Comment responder error:", err.message));

// Post the first video after 5 seconds to give Telegram time to connect and grab the queue
setTimeout(() => {
  runReelsPublisherJob().catch((err) => console.error("[Startup] Multi-Platform publisher error:", err.message));
}, 5000);

// Post gaming tips on Asta Plays every 5 hours (1:00 AM, 6:00 AM, 11:00 AM, 4:00 PM, 9:00 PM)
schedule.scheduleJob("0 1,6,11,16,21 * * *", () => {
  console.log("\n[Scheduler] Running Asta Plays job at:", new Date().toLocaleString());
  runAstaJob();
});

// Post science facts on Nano Facts every 5 hours (1:00 AM, 6:00 AM, 11:00 AM, 4:00 PM, 9:00 PM)
schedule.scheduleJob("0 1,6,11,16,21 * * *", () => {
  console.log("\n[Scheduler] Running Nano Facts job at:", new Date().toLocaleString());
  runNanoJob();
});

// Check for new Facebook comments every 2 minutes and reply like a real person
schedule.scheduleJob("*/2 * * * *", () => {
  runCommentResponderJob();
});

// Post video reels to Facebook, YouTube, and TikTok every 4 hours (12:00 AM, 4:00 AM, 8:00 AM, 12:00 PM, 4:00 PM, 8:00 PM)
schedule.scheduleJob("0 0,4,8,12,16,20 * * *", () => {
  console.log("\n[Scheduler] Running Multi-Platform (FB + YouTube + TikTok) Auto-Publisher at:", new Date().toLocaleString());
  runReelsPublisherJob();
});
