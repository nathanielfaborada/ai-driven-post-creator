import { config } from "../config/env.js";
import {
  getQueue,
  downloadVideoBuffer,
  archiveAndCleanupReel,
  getRandomArchiveItem,
  markArchiveItemReposted,
} from "../services/telegram.service.js";
import { publishFacebookReel } from "../services/facebook.service.js";
import { toUnicodeBold } from "../utils/formatters.js";

/**
 * Execute the Facebook Reels posting pipeline (FIFO queue with Evergreen Archive Fallback).
 */
export async function runReelsPublisherJob() {
  console.log("\n=========================================");
  console.log("[Reels Publisher] 🎬 Starting Reels Posting Workflow...");
  console.log("=========================================");

  const queue = getQueue();

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

    console.log(`[Reels Publisher] 🚀 Publishing Reel to Facebook (Page ID: ${config.nanoFacts.pageId})...`);
    const formattedCaption = toUnicodeBold(nextItem.caption || "");
    const fbRes = await publishFacebookReel({
      videoBuffer,
      caption: formattedCaption,
      pageId: config.nanoFacts.pageId,
      pageToken: config.nanoFacts.pageToken,
    });

    if (fbRes.success) {
      console.log(`[Reels Publisher] ✅ Published successfully! Facebook Video ID: ${fbRes.videoId}`);
      console.log("[Reels Publisher] 📦 Archiving to Channel 2 & cleaning up Channel 1...");
      await archiveAndCleanupReel(nextItem, fbRes.videoId);
    } else {
      console.error("[Reels Publisher] ❌ Facebook publishing failed. Message kept in queue for retry.", fbRes.error);
    }
  } else {
    // 2. Fallback: Queue is empty -> Pick from Archive
    console.log("[Reels Publisher] ℹ️ Queue is empty! Checking Archive for Evergreen content...");
    const archiveItem = getRandomArchiveItem();

    if (!archiveItem) {
      console.log("[Reels Publisher] 📭 Archive is also empty (no past reels recorded yet). Waiting for new uploads in Channel 1.");
      return;
    }

    console.log(`[Reels Publisher] 🔄 Selected archived reel (Repost Count: ${archiveItem.repostCount || 0}). Downloading...`);
    const videoBuffer = await downloadVideoBuffer(archiveItem.fileId);

    if (!videoBuffer) {
      console.error("[Reels Publisher] ❌ Failed to download archived video buffer.");
      return;
    }

    console.log(`[Reels Publisher] 🚀 Reposting archived Reel to Facebook...`);
    const formattedCaption = toUnicodeBold(archiveItem.caption || "");
    const fbRes = await publishFacebookReel({
      videoBuffer,
      caption: formattedCaption,
      pageId: config.nanoFacts.pageId,
      pageToken: config.nanoFacts.pageToken,
    });

    if (fbRes.success) {
      console.log(`[Reels Publisher] ✅ Successfully reposted archived reel to Facebook! Video ID: ${fbRes.videoId}`);
      markArchiveItemReposted(archiveItem.fileId);
    } else {
      console.error("[Reels Publisher] ❌ Facebook reposting failed:", fbRes.error);
    }
  }
}
