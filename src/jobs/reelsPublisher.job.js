import { config } from "../config/env.js";
import {
  getQueue,
  downloadVideoBuffer,
  archiveAndCleanupReel,
  getRandomArchiveItem,
  markArchiveItemReposted,
  logArchiveStats,
} from "../services/telegram.service.js";
import { publishFacebookReel } from "../services/facebook.service.js";
import { generateReelCaptionNanoFacts } from "../services/ai.service.js";
import { toUnicodeBold } from "../utils/formatters.js";

/**
 * Execute the Facebook Reels posting pipeline (FIFO queue with Evergreen Archive Fallback).
 */
export async function runReelsPublisherJob() {
  console.log("\n=========================================");
  console.log("[Reels Publisher] 🎬 Starting Reels Posting Workflow...");
  console.log("=========================================");

  await logArchiveStats();

  const queue = await getQueue();

  if (queue.length > 0) {
    // 1. Process FIFO item from queue (Top-most / oldest)
    const nextItem = queue[0];
    console.log(`[Reels Publisher] 📌 Found ${queue.length} item(s) in Queue. Picking first reel (Msg ID: ${nextItem.messageId})...`);

    console.log("[Reels Publisher] 📥 Downloading video from Telegram...");
    const videoBuffer = await downloadVideoBuffer(nextItem.fileId);

    if (!videoBuffer) {
      console.error("[Reels Publisher] ❌ Failed to download video buffer. Aborting this run.");
      return;
    }

    console.log(`[Reels Publisher] 🧠 Generating AI SEO Reel Caption (Input Context: "${nextItem.caption || "None"}")`);
    const { topicName, caption: generatedCaption, category } = await generateReelCaptionNanoFacts(nextItem.caption || "");
    const finalCaption = generatedCaption || toUnicodeBold(nextItem.caption || "");
    console.log(`[Reels Publisher] Category: [${category}] | Topic: ${topicName}`);
    console.log(`[Reels Publisher] Final Caption:\n${finalCaption}\n`);

    console.log(`[Reels Publisher] 🚀 Publishing Reel to Facebook (Page ID: ${config.nanoFacts.pageId})...`);
    const fbRes = await publishFacebookReel({
      videoBuffer,
      caption: finalCaption,
      pageId: config.nanoFacts.pageId,
      pageToken: config.nanoFacts.pageToken,
    });

    if (fbRes.success) {
      console.log(`[Reels Publisher] ✅ Published successfully! Facebook Video ID: ${fbRes.videoId}`);
      console.log(`[Reels Publisher] 📦 Archiving to [${category}] Archive Channel & cleaning up Channel 1...`);
      await archiveAndCleanupReel(nextItem, fbRes.videoId, category);
    } else {
      console.error("[Reels Publisher] ❌ Facebook publishing failed. Message kept in queue for retry.", fbRes.error);
    }
  } else {
    // 2. Fallback: Queue is empty -> Pick from Archive (Requires at least 10 videos per category)
    const MIN_ARCHIVE_COUNT = 10;
    const archiveItem = await getRandomArchiveItem(MIN_ARCHIVE_COUNT);

    if (!archiveItem) {
      console.log(`[Reels Publisher] ℹ️ Queue is empty and Archive has fewer than ${MIN_ARCHIVE_COUNT} videos. At least ${MIN_ARCHIVE_COUNT} archived videos are required per category before recycling starts to avoid repetitive posts. Waiting for new uploads in Channel 1.`);
      return;
    }

    console.log(`[Reels Publisher] 🔄 Selected archived reel from [${archiveItem.category || "General"}] (Repost Count: ${archiveItem.repostCount || 0}). Downloading...`);
    const videoBuffer = await downloadVideoBuffer(archiveItem.fileId);

    if (!videoBuffer) {
      console.error("[Reels Publisher] ❌ Failed to download archived video buffer.");
      return;
    }

    console.log(`[Reels Publisher] 🧠 Generating fresh AI SEO Caption for archived reel...`);
    const { topicName, caption: generatedCaption } = await generateReelCaptionNanoFacts(archiveItem.caption || "");
    const finalCaption = generatedCaption || toUnicodeBold(archiveItem.caption || "");
    console.log(`[Reels Publisher] Topic:`, topicName);
    console.log(`[Reels Publisher] Final Caption:\n${finalCaption}\n`);

    console.log(`[Reels Publisher] 🚀 Reposting archived Reel to Facebook...`);
    const fbRes = await publishFacebookReel({
      videoBuffer,
      caption: finalCaption,
      pageId: config.nanoFacts.pageId,
      pageToken: config.nanoFacts.pageToken,
    });

    if (fbRes.success) {
      console.log(`[Reels Publisher] ✅ Successfully reposted archived reel to Facebook! Video ID: ${fbRes.videoId}`);
      await markArchiveItemReposted(archiveItem.fileId);
    } else {
      console.error("[Reels Publisher] ❌ Facebook reposting failed:", fbRes.error);
    }
  }
}
