import { createClient } from "@supabase/supabase-js";
import { config } from "../config/env.js";
import { SCIENCE_CATEGORIES } from "./ai.service.js";

const supabaseUrl = config.supabase?.url;
const supabaseKey = config.supabase?.key;

if (!supabaseUrl || !supabaseKey) {
  console.warn("[Supabase Service] [WARN] Missing SUPABASE_URL or SUPABASE_KEY in configuration.");
}

export const supabase = (supabaseUrl && supabaseKey)
  ? createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    })
  : null;

// Check if our Supabase database and storage bucket are connected and ready
export async function testSupabaseConnection() {
  if (!supabase) {
    console.error("[Supabase Service] [ERROR] Supabase client is not initialized.");
    return false;
  }

  try {
    const { error: qError } = await supabase.from("reels_queue").select("id").limit(1);
    const { error: aError } = await supabase.from("reels_archive").select("id").limit(1);

    if (qError || aError) {
      console.error("[Supabase Service] [WARN] Supabase connected, but tables may need initialization:", qError?.message || aError?.message);
      return false;
    }

    // Check if the video storage bucket is available
    try {
      const { data: bucketData, error: bError } = await supabase.storage.getBucket("reels-media");
      if (bError) {
        console.warn("[Supabase Storage] [WARN] 'reels-media' bucket check:", bError.message);
      } else {
        console.log("[Supabase Storage] [SUCCESS] Storage bucket 'reels-media' is active and ready.");
      }
    } catch {
      // Storage check is optional
    }

    console.log("[Supabase Service] [SUCCESS] Successfully connected to Supabase database (Tables: reels_queue, reels_archive ready).");
    return true;
  } catch (err) {
    console.error("[Supabase Service] [ERROR] Supabase connection error:", err.message);
    return false;
  }
}

// Get the list of videos waiting in the queue (oldest first)
export async function getQueue() {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("reels_queue")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[Supabase Service] [ERROR] Error fetching reels_queue:", error.message);
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
    console.error("[Supabase Service] [ERROR] Exception reading queue:", err.message);
    return [];
  }
}

// Add a new video upload to our database queue
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
      console.error("[Supabase Service] [ERROR] Error adding to reels_queue:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Supabase Service] [ERROR] Exception adding to queue:", err.message);
    return false;
  }
}

// Delete a video from the queue once it has been posted
export async function removeFromQueue(messageId) {
  if (!supabase) return false;
  try {
    const { error } = await supabase
      .from("reels_queue")
      .delete()
      .eq("message_id", messageId);

    if (error) {
      console.error("[Supabase Service] [ERROR] Error removing from reels_queue:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Supabase Service] [ERROR] Exception removing from queue:", err.message);
    return false;
  }
}

// Get all saved videos from our 10-category archive library
export async function getArchive() {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("reels_archive")
      .select("*")
      .order("id", { ascending: true });

    if (error) {
      console.error("[Supabase Service] [ERROR] Error fetching reels_archive:", error.message);
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
    console.error("[Supabase Service] [ERROR] Exception reading archive:", err.message);
    return [];
  }
}

// Save a video into our permanent archive table with its category
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
      console.error("[Supabase Service] [ERROR] Error saving to reels_archive:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Supabase Service] [ERROR] Exception saving to archive:", err.message);
    return false;
  }
}

// Pick the next video to repost using strict round-robin rotation across the 10 categories
export async function getNextRoundRobinArchiveItem(minThresholdPerCategory = 10) {
  const archive = await getArchive();
  if (!archive || archive.length === 0) {
    return null;
  }

  // Group videos by category
  const categoriesMap = {};
  for (const item of archive) {
    const cat = item.category || "General";
    if (!categoriesMap[cat]) categoriesMap[cat] = [];
    categoriesMap[cat].push(item);
  }

  // Only consider categories that have reached our minimum video threshold (e.g. 10 videos)
  const statusLog = [];
  const qualifiedCategories = [];

  const allKnownCategories = [
    ...SCIENCE_CATEGORIES,
    ...Object.keys(categoriesMap).filter((c) => !SCIENCE_CATEGORIES.includes(c)),
  ];

  for (const catName of allKnownCategories) {
    const items = categoriesMap[catName] || [];
    if (items.length >= minThresholdPerCategory) {
      qualifiedCategories.push(catName);
      statusLog.push(`${catName}: ${items.length} items (Qualified >= ${minThresholdPerCategory})`);
    } else if (items.length > 0) {
      statusLog.push(`${catName}: ${items.length}/${minThresholdPerCategory} items (Need ${minThresholdPerCategory - items.length} more)`);
    }
  }

  if (qualifiedCategories.length === 0) {
    console.log(`[Supabase Service] [INFO] Archive Threshold Status:\n  - ${statusLog.join("\n  - ")}\n  No category has reached the minimum ${minThresholdPerCategory} videos yet.`);
    return null;
  }

  // Pick the next category in order (round-robin) based on which category was reposted last
  const repostedItems = archive
    .filter((item) => item.lastRepostedAt)
    .sort((a, b) => new Date(b.lastRepostedAt).getTime() - new Date(a.lastRepostedAt).getTime());

  let nextCategory = qualifiedCategories[0];

  if (repostedItems.length > 0) {
    const lastCategory = repostedItems[0].category;
    const lastIdx = qualifiedCategories.indexOf(lastCategory);
    if (lastIdx !== -1) {
      nextCategory = qualifiedCategories[(lastIdx + 1) % qualifiedCategories.length];
    }
  }

  const categoryItems = categoriesMap[nextCategory] || [];
  if (categoryItems.length === 0) {
    return null;
  }

  // Strict leveling: Only pick videos that have the lowest repost count in this category
  const minCount = Math.min(...categoryItems.map((item) => item.repostCount || 0));

  const strictCandidates = categoryItems.filter(
    (item) => (item.repostCount || 0) === minCount
  );

  // If multiple videos have the same count, pick the oldest one first
  strictCandidates.sort((a, b) => {
    const timeA = a.lastRepostedAt
      ? new Date(a.lastRepostedAt).getTime()
      : new Date(a.originalPostedAt || 0).getTime() || (a.id || 0);
    const timeB = b.lastRepostedAt
      ? new Date(b.lastRepostedAt).getTime()
      : new Date(b.originalPostedAt || 0).getTime() || (b.id || 0);
    return timeA - timeB;
  });

  const selectedItem = strictCandidates[0];

  console.log(
    `[Supabase Service] [ROUND-ROBIN] Selected Category: [${nextCategory}] | Repost Count Tier: ${minCount} | Video ID: #${selectedItem.id} (File ID: ${selectedItem.fileId?.slice(0, 15)}...) | Remaining in Tier ${minCount}: ${strictCandidates.length}`
  );

  return selectedItem;
}

// Backwards compatibility alias
export const getRandomArchiveItem = getNextRoundRobinArchiveItem;

// Increase the repost count by 1 and save the timestamp
export async function markArchiveItemReposted(fileId) {
  if (!supabase) return false;
  try {
    // 1. Get current count
    const { data, error: fetchErr } = await supabase
      .from("reels_archive")
      .select("repost_count")
      .eq("file_id", fileId)
      .single();

    if (fetchErr) {
      console.error("[Supabase Service] [ERROR] Error fetching item for repost update:", fetchErr.message);
      return false;
    }

    const newCount = (data?.repost_count || 0) + 1;

    // 2. Save the new count and current time
    const { error: updateErr } = await supabase
      .from("reels_archive")
      .update({
        repost_count: newCount,
        last_reposted_at: new Date().toISOString(),
      })
      .eq("file_id", fileId);

    if (updateErr) {
      console.error("[Supabase Service] [ERROR] Error updating repost count:", updateErr.message);
      return false;
    }

    return true;
  } catch (err) {
    console.error("[Supabase Service] [ERROR] Exception updating repost count:", err.message);
    return false;
  }
}

// Print a summary of how many videos we have in each category and their repost counts
export async function logArchiveStats() {
  const archive = await getArchive();
  const categoryStats = {};

  for (const item of archive) {
    const cat = item.category || "General";
    if (!categoryStats[cat]) {
      categoryStats[cat] = { total: 0, tiers: {} };
    }
    categoryStats[cat].total += 1;
    const count = item.repostCount || 0;
    categoryStats[cat].tiers[count] = (categoryStats[cat].tiers[count] || 0) + 1;
  }

  console.log(`\n=========================================`);
  console.log(`[Nano Facts 10-Category Evergreen Library Stats]`);
  for (const catName of SCIENCE_CATEGORIES) {
    const stats = categoryStats[catName];
    if (stats) {
      const tierDetails = Object.entries(stats.tiers)
        .map(([tier, qty]) => `Tier ${tier}: ${qty}`)
        .join(", ");
      console.log(`  - ${catName}: ${stats.total} video(s) [${tierDetails}]`);
    } else {
      console.log(`  - ${catName}: 0 video(s) (Empty)`);
    }
  }
  console.log(`  - Total Evergreen Library: ${archive.length} video(s)`);
  console.log(`=========================================\n`);
}

// Save a backup copy of the video file into Supabase Cloud Storage under its category folder
export async function uploadVideoToStorage(buffer, fileName, contentType = "video/mp4", category = "General", bucketName = "reels-media") {
  if (!supabase || !buffer) return null;
  try {
    const cleanFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const folderName = category ? category.trim() : "General";
    const filePath = `${folderName}/${Date.now()}_${cleanFileName}`;

    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(filePath, buffer, {
        contentType: contentType,
        upsert: true,
      });

    if (error) {
      console.error(`[Supabase Storage] [ERROR] Upload failed to '${bucketName}/${folderName}':`, error.message);
      return null;
    }

    const { data: urlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(filePath);

    const publicUrl = urlData?.publicUrl || "";
    console.log(`[Supabase Storage] [SUCCESS] Uploaded to [${folderName}] -> ${publicUrl}`);

    return {
      path: filePath,
      publicUrl: publicUrl,
    };
  } catch (err) {
    console.error("[Supabase Storage] [ERROR] Exception uploading video:", err.message);
    return null;
  }
}

// Get a list of video files stored in a category folder
export async function listCategoryVideosFromStorage(category = "", bucketName = "reels-media") {
  if (!supabase) return [];
  try {
    const folderPath = category ? category.trim() : "";
    const { data, error } = await supabase.storage
      .from(bucketName)
      .list(folderPath, {
        limit: 100,
        sortBy: { column: "created_at", order: "desc" },
      });

    if (error) {
      console.error(`[Supabase Storage] [ERROR] Error listing folder '${folderPath}':`, error.message);
      return [];
    }

    return (data || []).map((file) => ({
      name: file.name,
      id: file.id,
      size: file.metadata?.size,
      mimetype: file.metadata?.mimetype,
      publicUrl: getPublicVideoUrl(`${folderPath ? folderPath + "/" : ""}${file.name}`, bucketName),
      createdAt: file.created_at,
    }));
  } catch (err) {
    console.error("[Supabase Storage] [ERROR] Exception listing storage files:", err.message);
    return [];
  }
}

// Get the direct web link for a video in Supabase Storage
export function getPublicVideoUrl(filePath, bucketName = "reels-media") {
  if (!supabase || !filePath) return "";
  const { data } = supabase.storage.from(bucketName).getPublicUrl(filePath);
  return data?.publicUrl || "";
}

// Delete a video file from Supabase Storage
export async function deleteVideoFromStorage(filePath, bucketName = "reels-media") {
  if (!supabase || !filePath) return false;
  try {
    const { error } = await supabase.storage.from(bucketName).remove([filePath]);
    if (error) {
      console.error(`[Supabase Storage] [ERROR] Failed to delete ${filePath}:`, error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Supabase Storage] [ERROR] Exception deleting file:", err.message);
    return false;
  }
}
