import { createClient } from "@supabase/supabase-js";
import { config } from "../config/env.js";

const supabaseUrl = config.supabase?.url;
const supabaseKey = config.supabase?.key;

if (!supabaseUrl || !supabaseKey) {
  console.warn("[Supabase Service] ⚠️ Missing SUPABASE_URL or SUPABASE_KEY in configuration!");
}

export const supabase = (supabaseUrl && supabaseKey)
  ? createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    })
  : null;

/**
 * Check if Supabase client is connected and tables exist.
 * @returns {Promise<boolean>}
 */
export async function testSupabaseConnection() {
  if (!supabase) {
    console.error("[Supabase Service] ❌ Supabase client is not initialized.");
    return false;
  }

  try {
    const { error: qError } = await supabase.from("reels_queue").select("id").limit(1);
    const { error: aError } = await supabase.from("reels_archive").select("id").limit(1);

    if (qError || aError) {
      console.error("[Supabase Service] ⚠️ Supabase connected, but tables may need initialization:", qError?.message || aError?.message);
      return false;
    }

    console.log("[Supabase Service] ✅ Successfully connected to Supabase database (Tables: reels_queue, reels_archive ready).");
    return true;
  } catch (err) {
    console.error("[Supabase Service] ❌ Supabase connection error:", err.message);
    return false;
  }
}

/**
 * Fetch all pending items from the Reels queue (FIFO order).
 * @returns {Promise<Array<Object>>}
 */
export async function getQueue() {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("reels_queue")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[Supabase Service] Error fetching reels_queue:", error.message);
      return [];
    }

    return (data || []).map((item) => ({
      id: item.id,
      messageId: item.message_id,
      fileId: item.file_id,
      caption: item.caption || "",
      fileSize: item.file_size,
      duration: item.duration,
      addedAt: item.created_at,
    }));
  } catch (err) {
    console.error("[Supabase Service] Exception reading queue:", err.message);
    return [];
  }
}

/**
 * Add a new video reel to the pending queue.
 * @param {Object} item
 * @returns {Promise<boolean>}
 */
export async function addToQueue({ messageId, fileId, caption = "", fileSize = null, duration = null }) {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from("reels_queue").upsert(
      {
        message_id: messageId,
        file_id: fileId,
        caption: caption || "",
        file_size: fileSize,
        duration: duration,
      },
      { onConflict: "message_id", ignoreDuplicates: true }
    );

    if (error) {
      console.error("[Supabase Service] Error adding to reels_queue:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Supabase Service] Exception adding to queue:", err.message);
    return false;
  }
}

/**
 * Remove a processed reel from the pending queue.
 * @param {number|string} messageId
 * @returns {Promise<boolean>}
 */
export async function removeFromQueue(messageId) {
  if (!supabase) return false;
  try {
    const { error } = await supabase
      .from("reels_queue")
      .delete()
      .eq("message_id", messageId);

    if (error) {
      console.error("[Supabase Service] Error removing from reels_queue:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Supabase Service] Exception removing from queue:", err.message);
    return false;
  }
}

/**
 * Fetch all archived evergreen reels.
 * @returns {Promise<Array<Object>>}
 */
export async function getArchive() {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("reels_archive")
      .select("*")
      .order("id", { ascending: true });

    if (error) {
      console.error("[Supabase Service] Error fetching reels_archive:", error.message);
      return [];
    }

    return (data || []).map((item) => ({
      id: item.id,
      fileId: item.file_id,
      category: item.category || "General",
      caption: item.caption || "",
      originalPostedAt: item.original_posted_at,
      lastRepostedAt: item.last_reposted_at,
      repostCount: item.repost_count || 0,
      fbVideoId: item.fb_video_id,
    }));
  } catch (err) {
    console.error("[Supabase Service] Exception reading archive:", err.message);
    return [];
  }
}

/**
 * Add or update an archived reel with category and stats.
 * @param {Object} params
 * @returns {Promise<boolean>}
 */
export async function addToArchive({ fileId, category = "General", caption = "", fbVideoId = null }) {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from("reels_archive").upsert(
      {
        file_id: fileId,
        category: category || "General",
        caption: caption || "",
        fb_video_id: fbVideoId,
        original_posted_at: new Date().toISOString(),
      },
      { onConflict: "file_id" }
    );

    if (error) {
      console.error("[Supabase Service] Error saving to reels_archive:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Supabase Service] Exception saving to archive:", err.message);
    return false;
  }
}

/**
 * Select a random reel from eligible archive categories that meet the minimum threshold.
 * Prioritizes reels with the lowest repost count.
 * @param {number} [minThresholdPerCategory=10]
 * @returns {Promise<Object|null>}
 */
export async function getRandomArchiveItem(minThresholdPerCategory = 10) {
  const archive = await getArchive();
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
    console.log(`[Supabase Service] ⏳ Archive Threshold Status:\n  - ${statusLog.join("\n  - ")}\n  No category has reached the minimum ${minThresholdPerCategory} videos yet.`);
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
 * Increment repost count and update timestamp for an archived reel.
 * @param {string} fileId
 * @returns {Promise<boolean>}
 */
export async function markArchiveItemReposted(fileId) {
  if (!supabase) return false;
  try {
    // 1. Fetch current count
    const { data, error: fetchErr } = await supabase
      .from("reels_archive")
      .select("repost_count")
      .eq("file_id", fileId)
      .single();

    if (fetchErr) {
      console.error("[Supabase Service] Error fetching item for repost update:", fetchErr.message);
      return false;
    }

    const newCount = (data?.repost_count || 0) + 1;

    // 2. Update repost count and timestamp
    const { error: updateErr } = await supabase
      .from("reels_archive")
      .update({
        repost_count: newCount,
        last_reposted_at: new Date().toISOString(),
      })
      .eq("file_id", fileId);

    if (updateErr) {
      console.error("[Supabase Service] Error updating repost count:", updateErr.message);
      return false;
    }

    return true;
  } catch (err) {
    console.error("[Supabase Service] Exception updating repost count:", err.message);
    return false;
  }
}

/**
 * Log live statistics of archived evergreen reels across all 10 categories.
 */
export async function logArchiveStats() {
  const archive = await getArchive();
  const categoryCounts = {};

  for (const item of archive) {
    const cat = item.category || "General";
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  }

  console.log(`\n=========================================`);
  console.log(`📊 [Nano Facts 10-Category Evergreen Library]`);
  for (const [catName, count] of Object.entries(categoryCounts)) {
    console.log(`  📁 ${catName}: ${count} video(s)`);
  }
  console.log(`  📦 Total Evergreen Library: ${archive.length} video(s)`);
  console.log(`=========================================\n`);
}
