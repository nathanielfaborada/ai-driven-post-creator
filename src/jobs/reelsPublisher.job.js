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
import { publishYouTubeShort } from "../services/youtube.service.js";
import { publishTikTokVideo } from "../services/tiktok.service.js";
import { generateReelCaptionNanoFacts, generateYouTubeShortsMetadata } from "../services/ai.service.js";
import { toUnicodeBold } from "../utils/formatters.js";

/**
 * Execute the Facebook Reels, YouTube Shorts & TikTok triple cross-posting pipeline.
 */
export async function runReelsPublisherJob() {
  console.log("\n========================================================");
  console.log("[Reels Publisher] 🎬 Starting Multi-Platform (FB + YT + TikTok) Workflow...");
  console.log("========================================================");

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
    const { topicName, rawTitle, caption: generatedCaption, category } = await generateReelCaptionNanoFacts(nextItem.caption || "");
    const finalCaption = generatedCaption || toUnicodeBold(nextItem.caption || "");
    console.log(`[Reels Publisher] Category: [${category}] | Topic: ${topicName}`);
    console.log(`[Reels Publisher] Final Facebook Caption:\n${finalCaption}\n`);

    // Generate YouTube Shorts Metadata
    const ytMeta = generateYouTubeShortsMetadata({
      topicName,
      category,
      rawTitle,
    });

    // 1. Post to Facebook Reels
    console.log(`[Reels Publisher] 🚀 Publishing Reel to Facebook (Page ID: ${config.nanoFacts.pageId})...`);
    const fbRes = await publishFacebookReel({
      videoBuffer,
      caption: finalCaption,
      pageId: config.nanoFacts.pageId,
      pageToken: config.nanoFacts.pageToken,
    });

    // 2. Cross-post to YouTube Shorts
    let ytRes = { success: false, videoId: null };
    if (config.youtube?.clientId && config.youtube?.refreshToken) {
      console.log(`[Reels Publisher] 📺 Cross-posting to YouTube Shorts: "${ytMeta.title}"...`);
      ytRes = await publishYouTubeShort({
        videoBuffer,
        title: ytMeta.title,
        description: ytMeta.description,
        tags: ytMeta.tags,
        privacyStatus: "public",
      });
    }

    // 3. Cross-post to TikTok
    let ttRes = { success: false, publishId: null };
    if (config.tiktok?.clientKey && config.tiktok?.refreshToken) {
      console.log(`[Reels Publisher] 🎵 Cross-posting to TikTok: "${topicName || "Science Fact"}"...`);
      ttRes = await publishTikTokVideo({
        videoBuffer,
        title: `${rawTitle || topicName || "Science Discovery"} #ScienceTok #NanoFacts #fyp #STEM`,
      });
    }

    if (fbRes.success || ytRes.success || ttRes.success) {
      console.log(`[Reels Publisher] ✅ Published! (FB: ${fbRes.videoId || "N/A"} | YT: ${ytRes.videoId || "N/A"} | TikTok: ${ttRes.publishId || "N/A"})`);
      console.log(`[Reels Publisher] 📦 Archiving to [${category}] Archive Channel & cleaning up Channel 1...`);
      await archiveAndCleanupReel(nextItem, fbRes.videoId || ytRes.videoId || ttRes.publishId, category);
    } else {
      console.error("[Reels Publisher] ❌ Publishing failed across all platforms. Message kept in queue for retry.");
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
    const { topicName, rawTitle, caption: generatedCaption } = await generateReelCaptionNanoFacts(archiveItem.caption || "");
    const finalCaption = generatedCaption || toUnicodeBold(archiveItem.caption || "");
    console.log(`[Reels Publisher] Topic:`, topicName);
    console.log(`[Reels Publisher] Final Caption:\n${finalCaption}\n`);

    const ytMeta = generateYouTubeShortsMetadata({
      topicName,
      category: archiveItem.category,
      rawTitle,
    });

    // 1. Repost to Facebook Reels
    console.log(`[Reels Publisher] 🚀 Reposting archived Reel to Facebook...`);
    const fbRes = await publishFacebookReel({
      videoBuffer,
      caption: finalCaption,
      pageId: config.nanoFacts.pageId,
      pageToken: config.nanoFacts.pageToken,
    });

    // 2. Cross-post to YouTube Shorts
    let ytRes = { success: false, videoId: null };
    if (config.youtube?.clientId && config.youtube?.refreshToken) {
      console.log(`[Reels Publisher] 📺 Reposting to YouTube Shorts: "${ytMeta.title}"...`);
      ytRes = await publishYouTubeShort({
        videoBuffer,
        title: ytMeta.title,
        description: ytMeta.description,
        tags: ytMeta.tags,
        privacyStatus: "public",
      });
    }

    // 3. Cross-post to TikTok
    let ttRes = { success: false, publishId: null };
    if (config.tiktok?.clientKey && config.tiktok?.refreshToken) {
      console.log(`[Reels Publisher] 🎵 Reposting to TikTok: "${topicName || "Science Fact"}"...`);
      ttRes = await publishTikTokVideo({
        videoBuffer,
        title: `${rawTitle || topicName || "Science Discovery"} #ScienceTok #NanoFacts #fyp #STEM`,
      });
    }

    if (fbRes.success || ytRes.success || ttRes.success) {
      console.log(`[Reels Publisher] ✅ Successfully reposted archived reel! (FB: ${fbRes.videoId || "N/A"} | YT: ${ytRes.videoId || "N/A"} | TikTok: ${ttRes.publishId || "N/A"})`);
      await markArchiveItemReposted(archiveItem.fileId);
    } else {
      console.error("[Reels Publisher] ❌ Reposting failed across all platforms.");
    }
  }
}
