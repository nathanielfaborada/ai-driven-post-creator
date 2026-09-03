import axios from "axios";
import https from "https";
import { config } from "../config/env.js";
import {
  getQueue,
  addToQueue,
  removeFromQueue,
  getArchive,
  addToArchive,
  getNextRoundRobinArchiveItem,
  getRandomArchiveItem,
  markArchiveItemReposted,
  logArchiveStats,
  uploadVideoToStorage,
} from "./supabase.service.js";

// Share database helper functions with the rest of the app
export {
  getQueue,
  getArchive,
  getNextRoundRobinArchiveItem,
  getRandomArchiveItem,
  markArchiveItemReposted,
  logArchiveStats,
};

const httpsAgent = new https.Agent({ keepAlive: true });

const tgClient = axios.create({
  baseURL: `https://api.telegram.org/bot${config.telegram.botToken}`,
  httpsAgent: httpsAgent,
  timeout: 30000,
});

// Download the video file from Telegram so we can upload it to Facebook, YouTube, and TikTok
export async function downloadVideoBuffer(fileId) {
  if (!fileId) return null;

  try {
    // 1. Ask Telegram for the file download path
    const fileRes = await tgClient.get("/getFile", {
      params: { file_id: fileId },
    });

    const filePath = fileRes.data?.result?.file_path;
    const fileSize = fileRes.data?.result?.file_size;

    if (!filePath) {
      throw new Error(`Could not find file_path for fileId: ${fileId}`);
    }

    if (fileSize && fileSize > 20 * 1024 * 1024) {
      console.warn(`[Telegram Service] [WARN] Video file size (${(fileSize / (1024 * 1024)).toFixed(2)} MB) exceeds Telegram standard bot 20MB limit.`);
    }

    // 2. Download the video as raw data
    const downloadUrl = `https://api.telegram.org/file/bot${config.telegram.botToken}/${filePath}`;
    const downloadRes = await axios.get(downloadUrl, {
      responseType: "arraybuffer",
      httpsAgent: httpsAgent,
      timeout: 60000,
    });

    return Buffer.from(downloadRes.data);
  } catch (err) {
    console.error("[Telegram Service] [ERROR] Error downloading video:", err.response?.data || err.message);
    return null;
  }
}

// Move a posted video from Channel 1 to its Category Archive channel and save it in Supabase
export async function archiveAndCleanupReel(queueItem, fbVideoId = "", category = "Human Biology & Anatomy") {
  const { messageId, fileId, caption } = queueItem;

  try {
    // 1. Find which Category Archive channel this belongs to
    const archiveChannels = config.telegram.archiveChannels || {};
    const destChannelId = archiveChannels[category] || archiveChannels["Human Biology & Anatomy"];

    // 2. Copy the video message to its Category Archive Channel in Telegram
    if (messageId && destChannelId && config.telegram.queueChannelId) {
      try {
        console.log(`[Telegram Service] Copying message ${messageId} to [${category}] Archive Channel (${destChannelId})...`);
        await tgClient.post("/copyMessage", {
          chat_id: destChannelId,
          from_chat_id: config.telegram.queueChannelId,
          message_id: messageId,
        });
      } catch (copyErr) {
        console.warn(`[Telegram Service] [WARN] Could not copy message to Telegram archive channel:`, copyErr.response?.data || copyErr.message);
      }

      // 3. Delete the video from Channel 1 so the queue stays clean
      try {
        console.log(`[Telegram Service] Deleting message ${messageId} from Queue Channel...`);
        await tgClient.post("/deleteMessage", {
          chat_id: config.telegram.queueChannelId,
          message_id: messageId,
        });
      } catch (delErr) {
        console.warn(`[Telegram Service] [WARN] Could not delete message from Queue channel:`, delErr.response?.data || delErr.message);
      }
    }

    // 4. Remove from queue table in database
    await removeFromQueue(messageId);

    // 5. Save to archive table in database
    await addToArchive({
      fileId,
      category,
      caption: caption || "",
      fbVideoId: fbVideoId || null,
    });

    // 6. Save a backup copy of the video in Supabase Storage
    try {
      console.log(`[Telegram Service] Uploading video to Supabase Storage [${category}] folder...`);
      const videoBuffer = await downloadVideoBuffer(fileId);
      if (videoBuffer) {
        await uploadVideoToStorage(videoBuffer, `${fileId}.mp4`, "video/mp4", category);
      }
    } catch (storageErr) {
      console.warn(`[Telegram Service] [WARN] Supabase storage backup skipped:`, storageErr.message);
    }

    console.log(`[Telegram Service] [SUCCESS] Successfully archived reel under category: "${category}" in Supabase.`);
    await logArchiveStats();
  } catch (err) {
    console.error("[Telegram Service] [WARN] Error during archive/cleanup:", err.message);
  }
}

let lastUpdateId = 0;
let isPolling = false;

// Check Telegram for new uploaded videos in the Queue channel or Category Archive channels
export async function pollTelegramUpdates() {
  try {
    const res = await tgClient.post("/getUpdates", {
      offset: lastUpdateId + 1,
      timeout: 20,
      allowed_updates: ["channel_post", "edited_channel_post", "message"],
    });

    const updates = res.data?.result || [];
    const targetQueueId = config.telegram.queueChannelId ? String(config.telegram.queueChannelId) : null;
    const archiveChannels = config.telegram.archiveChannels || {};

    // Map Telegram Channel IDs to Category names for quick lookup
    const channelToCategory = {};
    for (const [catName, cId] of Object.entries(archiveChannels)) {
      if (cId) {
        channelToCategory[String(cId)] = catName;
      }
    }

    for (const update of updates) {
      lastUpdateId = update.update_id;

      const post = update.channel_post || update.message;
      if (!post) continue;

      const chatId = String(post.chat?.id);
      const video = post.video || post.animation || (post.document?.mime_type?.startsWith("video/") ? post.document : null);
      if (!video) continue;

      const messageId = post.message_id;
      const fileId = video.file_id;
      const caption = post.caption || "";

      // 1. If uploaded to Channel 1 (Queue), add it to the posting queue
      if (targetQueueId && chatId === targetQueueId) {
        console.log(`\n[Telegram Service] [INFO] New Reel detected in Queue Channel (Msg ID: ${messageId})`);
        const added = await addToQueue({
          messageId,
          fileId,
          caption,
          fileSize: video.file_size,
          duration: video.duration,
        });

        if (added) {
          console.log(`[Telegram Service] [SUCCESS] Saved new Reel to Supabase queue (Msg ID: ${messageId})`);
        }
      }

      // 2. If uploaded directly into a Category Archive channel, save it directly to the archive library
      else if (channelToCategory[chatId]) {
        const categoryName = channelToCategory[chatId];
        console.log(`\n[Telegram Service] [INFO] Direct Reel seeded into [${categoryName}] Archive Channel (File ID: ${fileId.slice(-8)})`);
        const added = await addToArchive({
          fileId,
          category: categoryName,
          caption,
          fbVideoId: null,
        });

        if (added) {
          console.log(`[Telegram Service] [SUCCESS] Seeded Reel into Supabase archive table under [${categoryName}]`);
          
          // Save backup copy to Supabase Storage
          try {
            console.log(`[Telegram Service] Uploading seeded video to Supabase Storage [${categoryName}] folder...`);
            const videoBuffer = await downloadVideoBuffer(fileId);
            if (videoBuffer) {
              await uploadVideoToStorage(videoBuffer, `${fileId}.mp4`, "video/mp4", categoryName);
            }
          } catch (storageErr) {
            console.warn(`[Telegram Service] [WARN] Supabase storage backup skipped:`, storageErr.message);
          }
        }
      }
    }
  } catch (err) {
    if (err.response?.status === 409) {
      console.log("[Telegram Service] [INFO] Deployment handoff detected (409 Conflict). Waiting 5s before reconnecting...");
      await new Promise((resolve) => setTimeout(resolve, 5000));
    } else if (err.code !== "ECONNABORTED" && err.response?.status !== 408) {
      console.error("[Telegram Service] [ERROR] Polling error:", err.response?.data || err.message);
    }
  }
}

// Start listening for new Telegram video uploads 24/7 in the background
export function startTelegramListener() {
  if (isPolling) return;
  isPolling = true;

  console.log("[Telegram Service] [INFO] Telegram Queue and 10-Channel Archive Listener active.");

  const pollLoop = async () => {
    while (isPolling) {
      await pollTelegramUpdates();
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  };

  pollLoop().catch((err) => {
    console.error("[Telegram Service] [ERROR] Listener encountered fatal error:", err);
  });
}
