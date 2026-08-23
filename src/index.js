import schedule from "node-schedule";
import { runAstaJob } from "./jobs/astaPlays.job.js";
import { runNanoJob } from "./jobs/nanoFacts.job.js";
import { runCommentResponderJob } from "./jobs/commentResponder.job.js";
import { runReelsPublisherJob } from "./jobs/reelsPublisher.job.js";
import { startTelegramListener } from "./services/telegram.service.js";
import { startServer } from "./server.js";

console.log("=========================================");
console.log("🤖 AI-Driven Facebook Automation Started");
console.log("=========================================");

// Start Express Webhook Server (for Facebook Messenger AI Auto-Reply)
startServer();

// Start Telegram Queue Listener in background
startTelegramListener();

// Run posting jobs once immediately on startup
runAstaJob();
runNanoJob();

// Run comment responder once immediately on startup to process initial batch
runCommentResponderJob();

// Schedule Asta Plays at 1:00 AM, 4:00 AM, 7:00 AM, 10:00 AM, 1:00 PM, 4:00 PM, 7:00 PM, 10:00 PM
schedule.scheduleJob("0 1,4,7,10,13,16,19,22 * * *", () => {
  console.log("\n[Scheduler] Running Asta Plays job at:", new Date().toLocaleString());
  runAstaJob();
});

// Schedule Nano Facts (Text Post) at 1:00 AM, 4:00 AM, 7:00 AM, 10:00 AM, 1:00 PM, 4:00 PM, 7:00 PM, 10:00 PM
schedule.scheduleJob("0 1,4,7,10,13,16,19,22 * * *", () => {
  console.log("\n[Scheduler] Running Nano Facts job at:", new Date().toLocaleString());
  runNanoJob();
});

// Schedule Comment Auto-Responder to collect and reply every 3 hours
schedule.scheduleJob("0 */3 * * *", () => {
  console.log("\n[Scheduler] Running AI Comment Auto-Responder (Batch) at:", new Date().toLocaleString());
  runCommentResponderJob();
});

// Schedule Facebook Reels Auto-Publisher at 12:00 AM, 3:00 AM, 6:00 AM, 9:00 AM, 12:00 PM, 3:00 PM, 6:00 PM, 9:00 PM
schedule.scheduleJob("0 0,3,6,9,12,15,18,21 * * *", () => {
  console.log("\n[Scheduler] Running Facebook Reels Auto-Publisher at:", new Date().toLocaleString());
  runReelsPublisherJob();
});

