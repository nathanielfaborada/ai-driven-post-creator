import fs from "fs";
import path from "path";
import axios from "axios";
import https from "https";
import { config } from "../config/env.js";

const DATA_DIR = path.resolve("data");
const QUEUE_FILE = path.join(DATA_DIR, "reels_queue.json");
const ARCHIVE_FILE = path.join(DATA_DIR, "reels_archive.json");

const httpsAgent = new https.Agent({ keepAlive: true });

const tgClient = axios.create({
  baseURL: `https://api.telegram.org/bot${config.telegram.botToken}`,
  httpsAgent: httpsAgent,
  timeout: 30000,
});

/**
 * Initialize persistent storage directories and files.
 */
export function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(QUEUE_FILE)) {
    fs.writeFileSync(QUEUE_FILE, JSON.stringify([], null, 2));
  }
  if (!fs.existsSync(ARCHIVE_FILE)) {
    fs.writeFileSync(ARCHIVE_FILE, JSON.stringify([], null, 2));
  }
}

/**
 * Get current items in the pending queue.
 * @returns {Array<Object>}
 */
export function getQueue() {
  ensureDataFiles();
  try {
    const raw = fs.readFileSync(QUEUE_FILE, "utf-8");
    return JSON.parse(raw) || [];
  } catch (err) {
    console.error("[Telegram Service] Error reading queue file:", err.message);
    return [];
  }
}

/**
 * Save items to the pending queue.
 * @param {Array<Object>} items
 */
export function saveQueue(items) {
  ensureDataFiles();
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(items, null, 2));
}

/**
 * Get all archived posts.
 * @returns {Array<Object>}
 */
export function getArchive() {
  ensureDataFiles();
  try {
    const raw = fs.readFileSync(ARCHIVE_FILE, "utf-8");
    return JSON.parse(raw) || [];
  } catch (err) {
    console.error("[Telegram Service] Error reading archive file:", err.message);
    return [];
  }
}

/**
 * Save items to the archive file.
 * @param {Array<Object>} items
 */
export function saveArchive(items) {
  ensureDataFiles();
  fs.writeFileSync(ARCHIVE_FILE, JSON.stringify(items, null, 2));
}

/**
 * Download video buffer directly from Telegram.
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
    if (!filePath) {
      throw new Error(`Could not find file_path for fileId: ${fileId}`);
    }

    // 2. Download the binary stream
    const downloadUrl = `https://api.telegram.org/file/bot${config.telegram.botToken}/${filePath}`;
    const downloadRes = await axios.get(downloadUrl, {
      responseType: "arraybuffer",
      httpsAgent: ipv4Agent,
      timeout: 60000,
    });

    return Buffer.from(downloadRes.data);
  } catch (err) {
    console.error("[Telegram Service] ❌ Error downloading video:", err.response?.data || err.message);
    return null;
  }
}

/**
 * Archive a published reel from Channel 1 to Channel 2 and delete from Channel 1.
 * @param {Object} queueItem
 * @param {string} [fbVideoId]
 */
export async function archiveAndCleanupReel(queueItem, fbVideoId = "") {
  const { messageId, fileId, caption } = queueItem;

  try {
    // 1. Copy message to Channel 2 (Posted FB Reels Archive)
    if (messageId && config.telegram.archiveChannelId && config.telegram.queueChannelId) {
      console.log(`[Telegram Service] Copying message ${messageId} to Archive Channel...`);
      await tgClient.post("/copyMessage", {
        chat_id: config.telegram.archiveChannelId,
        from_chat_id: config.telegram.queueChannelId,
        message_id: messageId,
      });

      // 2. Delete message from Channel 1 (FB Reels to Post)
      console.log(`[Telegram Service] Deleting message ${messageId} from Queue Channel...`);
      await tgClient.post("/deleteMessage", {
        chat_id: config.telegram.queueChannelId,
        message_id: messageId,
      });
    }

    // 3. Remove from Queue file
    const currentQueue = getQueue();
    const updatedQueue = currentQueue.filter((q) => q.messageId !== messageId);
    saveQueue(updatedQueue);

    // 4. Add to Archive file
    const currentArchive = getArchive();
    const existingIndex = currentArchive.findIndex((a) => a.fileId === fileId);

    if (existingIndex >= 0) {
      currentArchive[existingIndex].lastRepostedAt = new Date().toISOString();
      currentArchive[existingIndex].repostCount = (currentArchive[existingIndex].repostCount || 0) + 1;
    } else {
      currentArchive.push({
        fileId,
        caption: caption || "",
        originalPostedAt: new Date().toISOString(),
        fbVideoId: fbVideoId || null,
        repostCount: 0,
        lastRepostedAt: null,
      });
    }
    saveArchive(currentArchive);
    console.log("[Telegram Service] ✅ Successfully archived and cleaned up reel.");
  } catch (err) {
    console.error("[Telegram Service] ⚠️ Error during archive/cleanup:", err.response?.data || err.message);
  }
}

/**
 * Select a random reel from the archive, prioritizing reels that haven't been reposted recently.
 * @returns {Object|null}
 */
export function getRandomArchiveItem() {
  const archive = getArchive();
  if (!archive || archive.length === 0) {
    return null;
  }

  // Sort by repostCount (ascending) so least reposted are favored, then shuffle among top candidates
  const sorted = [...archive].sort((a, b) => (a.repostCount || 0) - (b.repostCount || 0));
  const minCount = sorted[0].repostCount || 0;
  const candidatePool = sorted.filter((item) => (item.repostCount || 0) <= minCount + 1);

  const randomIndex = Math.floor(Math.random() * candidatePool.length);
  return candidatePool[randomIndex];
}

/**
 * Mark an archived item as reposted.
 * @param {string} fileId
 */
export function markArchiveItemReposted(fileId) {
  const archive = getArchive();
  const item = archive.find((a) => a.fileId === fileId);
  if (item) {
    item.repostCount = (item.repostCount || 0) + 1;
    item.lastRepostedAt = new Date().toISOString();
    saveArchive(archive);
  }
}

let lastUpdateId = 0;
let isPolling = false;

/**
 * Process incoming Telegram channel updates and queue any uploaded video reels.
 */
export async function pollTelegramUpdates() {
  try {
    const res = await tgClient.post("/getUpdates", {
      offset: lastUpdateId + 1,
      timeout: 20,
      allowed_updates: ["channel_post", "edited_channel_post", "message"],
    });

    const updates = res.data?.result || [];
    for (const update of updates) {
      lastUpdateId = update.update_id;

      const post = update.channel_post || update.message;
      if (!post) continue;

      // Check if message belongs to Queue Channel
      const chatId = String(post.chat?.id);
      const targetQueueId = String(config.telegram.queueChannelId);

      if (chatId === targetQueueId) {
        // Extract video or animation / document video
        const video = post.video || post.animation || (post.document?.mime_type?.startsWith("video/") ? post.document : null);
        if (video) {
          const messageId = post.message_id;
          const fileId = video.file_id;
          const caption = post.caption || "";

          const queue = getQueue();
          const alreadyExists = queue.some((item) => item.messageId === messageId);

          if (!alreadyExists) {
            console.log(`\n[Telegram Service] 📥 New Reel detected in Queue Channel (Msg ID: ${messageId})!`);
            queue.push({
              messageId,
              fileId,
              caption,
              date: post.date,
              fileSize: video.file_size,
              duration: video.duration,
              addedAt: new Date().toISOString(),
            });
            saveQueue(queue);
            console.log(`[Telegram Service] Total pending reels in queue: ${queue.length}`);
          }
        }
      }
    }
  } catch (err) {
    if (err.response?.status === 409) {
      console.log("[Telegram Service] ℹ️ Deployment handoff/restart detected (409 Conflict). Waiting 5s before reconnecting...");
      await new Promise((resolve) => setTimeout(resolve, 5000));
    } else if (err.code !== "ECONNABORTED" && err.response?.status !== 408) {
      console.error("[Telegram Service] Polling error:", err.response?.data || err.message);
    }
  }
}

/**
 * Start continuous background polling for new reels in Telegram Channel 1.
 */
export function startTelegramListener() {
  if (isPolling) return;
  isPolling = true;

  console.log("[Telegram Service] 🚀 Telegram Queue Listener active and monitoring Channel 1...");
  
  const pollLoop = async () => {
    while (isPolling) {
      await pollTelegramUpdates();
      // Brief pause to prevent spinning
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  };

  pollLoop().catch((err) => {
    console.error("[Telegram Service] Listener encountered fatal error:", err);
  });
}
