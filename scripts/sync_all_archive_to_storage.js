import { getArchive, uploadVideoToStorage, listCategoryVideosFromStorage } from "../src/services/supabase.service.js";
import { downloadVideoBuffer } from "../src/services/telegram.service.js";

async function syncAllArchiveToStorage() {
  console.log("[Sync Service] Starting batch synchronization from Telegram to Supabase Storage Bucket...");

  const archive = await getArchive();
  console.log(`[Sync Service] Found ${archive.length} record(s) in reels_archive table.`);

  if (archive.length === 0) {
    console.log("[Sync Service] No records to sync.");
    return;
  }

  let successCount = 0;
  let failCount = 0;

  for (const item of archive) {
    const { id, fileId, category, caption } = item;
    const cleanCategory = category || "General";

    console.log(`\n[Sync Service] Processing Item #${id} | Category: "${cleanCategory}" | File ID: ${fileId?.slice(0, 25)}...`);

    try {
      console.log(`[Sync Service] Downloading video buffer from Telegram...`);
      const buffer = await downloadVideoBuffer(fileId);

      if (!buffer || buffer.length === 0) {
        console.warn(`[Sync Service] [WARN] Could not download buffer for file_id: ${fileId}`);
        failCount++;
        continue;
      }

      console.log(`[Sync Service] Downloaded ${(buffer.length / (1024 * 1024)).toFixed(2)} MB. Uploading to Supabase Storage [${cleanCategory}]...`);
      const fileName = `reel_${id}_${fileId.slice(-10)}.mp4`;
      const result = await uploadVideoToStorage(buffer, fileName, "video/mp4", cleanCategory);

      if (result?.publicUrl) {
        console.log(`[Sync Service] [SUCCESS] Item #${id} saved to Storage -> ${result.publicUrl}`);
        successCount++;
      } else {
        console.error(`[Sync Service] [ERROR] Upload failed for Item #${id}`);
        failCount++;
      }
    } catch (err) {
      console.error(`[Sync Service] [ERROR] Exception syncing Item #${id}:`, err.message);
      failCount++;
    }
  }

  console.log(`\n=========================================`);
  console.log(`[Sync Service] Sync Completed!`);
  console.log(`  - Successfully Uploaded to Bucket: ${successCount}`);
  console.log(`  - Failed: ${failCount}`);
  console.log(`=========================================\n`);
}

syncAllArchiveToStorage();
