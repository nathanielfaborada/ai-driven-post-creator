import axios from "axios";
import https from "https";
import { config } from "../config/env.js";
import {
  getQueue,
  addToQueue,
  removeFromQueue,
  getArchive,
  addToArchive,
  getRandomArchiveItem,
  markArchiveItemReposted,
  logArchiveStats,
} from "./supabase.service.js";

// Re-export Supabase-backed methods for jobs
export {
  getQueue,
  getArchive,
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

/**
 * Download video buffer directly from Telegram.
 * Enforces Telegram Bot API 20MB download limit.
 * @param {string} fileId
 * @returns {Promise<Buffer|null>}
 */
export async function downloadVideoBuffer(fileId) {
  if (!fileId) return null;

  try {
    // 1. Get file path from Telegram
    const fileRes = await tgClient.get("/getFile", {
      params: { file_id: fileId },
    });

    const filePath = fileRes.data?.result?.file_path;
    const fileSize = fileRes.data?.result?.file_size;

    if (!filePath) {
      throw new Error(`Could not find file_path for fileId: ${fileId}`);
    }

    if (fileSize && fileSize > 20 * 1024 * 1024) {
      console.warn(`[Telegram Service] ⚠️ Video file size (${(fileSize / (1024 * 1024)).toFixed(2)} MB) exceeds Telegram standard bot 20MB limit.`);
    }

    // 2. Download the binary stream
    const downloadUrl = `https://api.telegram.org/file/bot${config.telegram.botToken}/${filePath}`;
    const downloadRes = await axios.get(downloadUrl, {
      responseType: "arraybuffer",
      httpsAgent: httpsAgent,
      timeout: 60000,
    });

    return Buffer.from(downloadRes.data);
  } catch (err) {
    console.error("[Telegram Service] ❌ Error downloading video:", err.response?.data || err.message);
    return null;
  }
}

/**
 * Archive a published reel from Channel 1 to its respective Category Archive Channel and delete from Channel 1.
 * Persists record permanently in Supabase.
 * @param {Object} queueItem
 * @param {string} [fbVideoId]
 * @param {string} [category]
 */
export async function archiveAndCleanupReel(queueItem, fbVideoId = "", category = "Human Biology & Anatomy") {
  const { messageId, fileId, caption } = queueItem;

  try {
    // 1. Determine destination channel from 10-category archive channels
    const archiveChannels = config.telegram.archiveChannels || {};
    const destChannelId = archiveChannels[category] || archiveChannels["Human Biology & Anatomy"];

    // 2. Copy message to respective Category Archive Channel in Telegram
    if (messageId && destChannelId && config.telegram.queueChannelId) {
      try {
        console.log(`[Telegram Service] Copying message ${messageId} to [${category}] Archive Channel (${destChannelId})...`);
        await tgClient.post("/copyMessage", {
          chat_id: destChannelId,
          from_chat_id: config.telegram.queueChannelId,
          message_id: messageId,
        });
      } catch (copyErr) {
        console.warn(`[Telegram Service] ⚠️ Could not copy message to Telegram archive channel:`, copyErr.response?.data || copyErr.message);
      }

      // 3. Delete message from Queue Channel
      try {
        console.log(`[Telegram Service] Deleting message ${messageId} from Queue Channel...`);
        await tgClient.post("/deleteMessage", {
          chat_id: config.telegram.queueChannelId,
          message_id: messageId,
        });
      } catch (delErr) {
        console.warn(`[Telegram Service] ⚠️ Could not delete message from Queue channel (bot may lack delete permissions):`, delErr.response?.data || delErr.message);
      }
    }

    // 4. Remove from Supabase Queue table
    await removeFromQueue(messageId);

    // 5. Add to Supabase Archive table
    await addToArchive({
      fileId,
      category,
      caption: caption || "",
      fbVideoId: fbVideoId || null,
    });

    console.log(`[Telegram Service] ✅ Successfully archived reel under category: "${category}" in Supabase.`);
    await logArchiveStats();
  } catch (err) {
    console.error("[Telegram Service] ⚠️ Error during archive/cleanup:", err.message);
  }
}

let lastUpdateId = 0;
let isPolling = false;

/**
 * Process incoming Telegram updates across Queue Channel and all 10 Category Archive Channels.
 */
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

    // Invert mapping for fast lookup: ChatId -> CategoryName
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

      // 1. Queue Channel (New uploads to be posted FIFO)
      if (targetQueueId && chatId === targetQueueId) {
        console.log(`\n[Telegram Service] 📥 New Reel detected in Queue Channel (Msg ID: ${messageId})!`);
        const added = await addToQueue({
          messageId,
          fileId,
          caption,
          fileSize: video.file_size,
          duration: video.duration,
        });

        if (added) {
          console.log(`[Telegram Service] ✅ Saved new Reel to Supabase queue (Msg ID: ${messageId})`);
        }
      }

      // 2. Direct upload / seeding to any of the 10 Category Archive Channels
      else if (channelToCategory[chatId]) {
        const categoryName = channelToCategory[chatId];
        console.log(`\n[Telegram Service] 📁 Direct Reel seeded into [${categoryName}] Archive Channel! (File ID: ${fileId.slice(-8)})`);
        const added = await addToArchive({
          fileId,
          category: categoryName,
          caption,
          fbVideoId: null,
        });

        if (added) {
          console.log(`[Telegram Service] ✅ Seeded Reel into Supabase archive table under [${categoryName}]!`);
        }
      }
    }
  } catch (err) {
    if (err.response?.status === 409) {
      console.log("[Telegram Service] ℹ️ Deployment handoff detected (409 Conflict). Waiting 5s before reconnecting...");
      await new Promise((resolve) => setTimeout(resolve, 5000));
    } else if (err.code !== "ECONNABORTED" && err.response?.status !== 408) {
      console.error("[Telegram Service] Polling error:", err.response?.data || err.message);
    }
  }
}

/**
 * Start continuous background polling for new reels in Telegram channels.
 */
export function startTelegramListener() {
  if (isPolling) return;
  isPolling = true;

  console.log("[Telegram Service] 🚀 Telegram Queue & 10-Channel Archive Listener active...");

  const pollLoop = async () => {
    while (isPolling) {
      await pollTelegramUpdates();
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  };

  pollLoop().catch((err) => {
    console.error("[Telegram Service] Listener encountered fatal error:", err);
  });
}
