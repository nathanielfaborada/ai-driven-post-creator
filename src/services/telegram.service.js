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
 * Archive a published reel from Channel 1 to Channel 2 and delete from Channel 1.
 * @param {Object} queueItem
 * @param {string} [fbVideoId]
 */
/**
 * Log live statistics of archived evergreen reels by category.
 */
export function logArchiveStats() {
  const archive = getArchive();
  const bioCount = archive.filter((i) => i.category === "Biology").length;
  const chemCount = archive.filter((i) => i.category === "Periodic Table").length;
  const otherCount = archive.filter((i) => i.category !== "Biology" && i.category !== "Periodic Table").length;

  console.log(`\n=========================================`);
  console.log(`📊 [Nano Facts Reels Archive Stats]`);
  console.log(`  🧬 Biology (Channel 2A): ${bioCount} video(s)`);
  console.log(`  ⚛️ Periodic Table (Channel 2B): ${chemCount} video(s)`);
  if (otherCount > 0) console.log(`  🔬 Other Science: ${otherCount} video(s)`);
  console.log(`  📦 Total Evergreen Library: ${archive.length} video(s)`);
  console.log(`=========================================\n`);
}

/**
 * Archive a published reel from Channel 1 to its respective Category Archive Channel and delete from Channel 1.
 * @param {Object} queueItem
 * @param {string} [fbVideoId]
 * @param {"Biology"|"Periodic Table"|"General"} [category]
 */
export async function archiveAndCleanupReel(queueItem, fbVideoId = "", category = "General") {
  const { messageId, fileId, caption } = queueItem;

  try {
    // 1. Determine destination channel based on category
    let destChannelId = null;
    if (category === "Biology") {
      destChannelId = config.telegram.archiveBiologyChannelId;
    } else if (category === "Periodic Table") {
      destChannelId = config.telegram.archivePeriodicChannelId;
    } else {
      // Fallback to Biology or Periodic archive if General
      destChannelId = config.telegram.archiveBiologyChannelId || config.telegram.archivePeriodicChannelId;
    }

    // 2. Copy message to respective Category Archive Channel
    if (messageId && destChannelId && config.telegram.queueChannelId) {
      console.log(`[Telegram Service] Copying message ${messageId} to [${category}] Archive Channel (${destChannelId})...`);
      await tgClient.post("/copyMessage", {
        chat_id: destChannelId,
        from_chat_id: config.telegram.queueChannelId,
        message_id: messageId,
      });

      // 3. Delete message from Channel 1 (FB Reels to Post)
      console.log(`[Telegram Service] Deleting message ${messageId} from Queue Channel...`);
      await tgClient.post("/deleteMessage", {
        chat_id: config.telegram.queueChannelId,
        message_id: messageId,
      });
    }

    // 4. Remove from Queue file
    const currentQueue = getQueue();
    const updatedQueue = currentQueue.filter((q) => q.messageId !== messageId);
    saveQueue(updatedQueue);

    // 5. Add to Archive file with category
    const currentArchive = getArchive();
    const existingIndex = currentArchive.findIndex((a) => a.fileId === fileId);

    if (existingIndex >= 0) {
      currentArchive[existingIndex].lastRepostedAt = new Date().toISOString();
      currentArchive[existingIndex].repostCount = (currentArchive[existingIndex].repostCount || 0) + 1;
      currentArchive[existingIndex].category = category;
    } else {
      currentArchive.push({
        fileId,
        category,
        caption: caption || "",
        originalPostedAt: new Date().toISOString(),
        fbVideoId: fbVideoId || null,
        repostCount: 0,
        lastRepostedAt: null,
      });
    }
    saveArchive(currentArchive);
    console.log(`[Telegram Service] ✅ Successfully archived reel under category: "${category}".`);
    logArchiveStats();
  } catch (err) {
    console.error("[Telegram Service] ⚠️ Error during archive/cleanup:", err.response?.data || err.message);
  }
}

/**
 * Select a random reel from eligible archive categories that meet the minimum threshold (default 10).
 * Prioritizes reels with the lowest repost count.
 * @param {number} [minThresholdPerCategory]
 * @returns {Object|null}
 */
export function getRandomArchiveItem(minThresholdPerCategory = 10) {
  const archive = getArchive();
  if (!archive || archive.length === 0) {
    return null;
  }

  // Group items by category
  const categories = {};
  for (const item of archive) {
    const cat = item.category || "General";
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(item);
  }

  // Filter categories that meet the threshold
  const eligibleItems = [];
  const statusLog = [];

  for (const [catName, items] of Object.entries(categories)) {
    if (items.length >= minThresholdPerCategory) {
      eligibleItems.push(...items);
      statusLog.push(`${catName}: ${items.length} items (✅ Qualified >= ${minThresholdPerCategory})`);
    } else {
      statusLog.push(`${catName}: ${items.length}/${minThresholdPerCategory} items (⏳ Need ${minThresholdPerCategory - items.length} more)`);
    }
  }

  if (eligibleItems.length === 0) {
    console.log(`[Telegram Service] ⏳ Archive Threshold Status:\n  - ${statusLog.join("\n  - ")}\n  No category has reached the minimum ${minThresholdPerCategory} videos yet.`);
    return null;
  }

  // Sort eligible items by repostCount (ascending) so least reposted are favored, then shuffle among top candidates
  const sorted = [...eligibleItems].sort((a, b) => (a.repostCount || 0) - (b.repostCount || 0));
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
 * Process incoming Telegram updates across Channel 1 (Queue), Channel 2A (Biology), and Channel 2B (Periodic Table).
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

      const chatId = String(post.chat?.id);
      const targetQueueId = String(config.telegram.queueChannelId);
      const targetBioId = config.telegram.archiveBiologyChannelId ? String(config.telegram.archiveBiologyChannelId) : null;
      const targetChemId = config.telegram.archivePeriodicChannelId ? String(config.telegram.archivePeriodicChannelId) : null;

      const video = post.video || post.animation || (post.document?.mime_type?.startsWith("video/") ? post.document : null);
      if (!video) continue;

      const messageId = post.message_id;
      const fileId = video.file_id;
      const caption = post.caption || "";

      // 1. Channel 1: Queue Channel (New uploads to be posted FIFO)
      if (chatId === targetQueueId) {
        const queue = getQueue();
        const alreadyExists = queue.some((item) => item.messageId === messageId || item.fileId === fileId);

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

      // 2. Channel 2A: Direct upload / seeding to Biology Archive
      else if (targetBioId && chatId === targetBioId) {
        const archive = getArchive();
        const alreadyExists = archive.some((item) => item.fileId === fileId);
        if (!alreadyExists) {
          console.log(`\n[Telegram Service] 🧬 Direct Biology Reel seeded into Archive (File ID: ${fileId.slice(-8)})!`);
          archive.push({
            fileId,
            category: "Biology",
            caption,
            originalPostedAt: new Date().toISOString(),
            fbVideoId: null,
            repostCount: 0,
            lastRepostedAt: null,
          });
          saveArchive(archive);
          logArchiveStats();
        }
      }

      // 3. Channel 2B: Direct upload / seeding to Periodic Table Archive
      else if (targetChemId && chatId === targetChemId) {
        const archive = getArchive();
        const alreadyExists = archive.some((item) => item.fileId === fileId);
        if (!alreadyExists) {
          console.log(`\n[Telegram Service] ⚛️ Direct Periodic Table Reel seeded into Archive (File ID: ${fileId.slice(-8)})!`);
          archive.push({
            fileId,
            category: "Periodic Table",
            caption,
            originalPostedAt: new Date().toISOString(),
            fbVideoId: null,
            repostCount: 0,
            lastRepostedAt: null,
          });
          saveArchive(archive);
          logArchiveStats();
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
