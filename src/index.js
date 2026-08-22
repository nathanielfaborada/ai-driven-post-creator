import schedule from "node-schedule";
import { runAstaJob } from "./jobs/astaPlays.job.js";
import { runNanoJob } from "./jobs/nanoFacts.job.js";
import { runCommentResponderJob } from "./jobs/commentResponder.job.js";

console.log("=========================================");
console.log("🤖 AI-Driven Facebook Automation Started");
console.log("=========================================");

// Run posting jobs once immediately on startup
runAstaJob();
runNanoJob();

// Run comment responder once immediately on startup to process initial batch
runCommentResponderJob();

// Schedule Asta Plays at 10:00 AM and 7:00 PM
schedule.scheduleJob("0 10,19 * * *", () => {
  console.log("\n[Scheduler] Running Asta Plays job at:", new Date().toLocaleString());
  runAstaJob();
});

// Schedule Nano Facts at 6:00 AM, 10:00 AM, 2:00 PM, 6:00 PM, 9:00 PM
schedule.scheduleJob("0 6,10,14,18,21 * * *", () => {
  console.log("\n[Scheduler] Running Nano Facts job at:", new Date().toLocaleString());
  runNanoJob();
});

// Schedule Comment Auto-Responder to collect and reply every 3 hours
schedule.scheduleJob("0 */3 * * *", () => {
  console.log("\n[Scheduler] Running AI Comment Auto-Responder (Batch) at:", new Date().toLocaleString());
  runCommentResponderJob();
});
