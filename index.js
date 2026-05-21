import "dotenv/config";
import axios from "axios";
import { GoogleGenAI } from "@google/genai";
import schedule from "node-schedule";
import { google } from "googleapis";
import fs from "fs";
import path from "path";
import os from "os";

// ─── Clients ───────────────────────────────────────────────────────────────
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const FB_PAGE_ID = process.env.FB_PAGE_ID;
const FB_PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;

// ─── Google Drive Auth ──────────────────────────────────────────────────────
// Requires a service account JSON key set via GOOGLE_SERVICE_ACCOUNT_KEY_PATH
// OR inline JSON via GOOGLE_SERVICE_ACCOUNT_JSON env var.
function getDriveClient() {
  let credentials;

  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  } else if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH) {
    credentials = JSON.parse(
      fs.readFileSync(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH, "utf8")
    );
  } else {
    throw new Error(
      "No Google service account credentials found. " +
        "Set GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SERVICE_ACCOUNT_KEY_PATH."
    );
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });

  return google.drive({ version: "v3", auth });
}

// ─── Drive Folder Helpers ───────────────────────────────────────────────────

/**
 * Find a folder by name inside a parent folder (or root if parentId is null).
 * Returns the folder's Drive ID or null.
 */
async function findFolder(drive, name, parentId = null) {
  const q = parentId
    ? `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
    : `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;

  const res = await drive.files.list({
    q,
    fields: "files(id, name)",
    spaces: "drive",
  });

  return res.data.files?.[0]?.id ?? null;
}

/**
 * Create a folder inside a parent. Returns the new folder's Drive ID.
 */
async function createFolder(drive, name, parentId = null) {
  const meta = {
    name,
    mimeType: "application/vnd.google-apps.folder",
    ...(parentId ? { parents: [parentId] } : {}),
  };
  const res = await drive.files.create({ requestBody: meta, fields: "id" });
  return res.data.id;
}

/**
 * Ensure root > Upload and root > Post folders exist.
 * Returns { uploadFolderId, postFolderId }.
 */
async function ensureFolders(drive) {
  const ROOT_NAME = "ai-driven-post-creator";

  let rootId = await findFolder(drive, ROOT_NAME);
  if (!rootId) {
    console.log(`Creating root folder "${ROOT_NAME}"...`);
    rootId = await createFolder(drive, ROOT_NAME);
  }

  let uploadId = await findFolder(drive, "Upload", rootId);
  if (!uploadId) {
    console.log('Creating "Upload" folder...');
    uploadId = await createFolder(drive, "Upload", rootId);
  }

  let postId = await findFolder(drive, "Post", rootId);
  if (!postId) {
    console.log('Creating "Post" folder...');
    postId = await createFolder(drive, "Post", rootId);
  }

  return { rootId, uploadId, postId };
}

/**
 * List video files in the Upload folder.
 * Returns array of { id, name }.
 */
async function listUploadedVideos(drive, uploadFolderId) {
  const res = await drive.files.list({
    q: `'${uploadFolderId}' in parents and mimeType contains 'video/' and trashed=false`,
    fields: "files(id, name, mimeType)",
    orderBy: "createdTime",
    spaces: "drive",
  });
  return res.data.files ?? [];
}

/**
 * Download a Drive file to a temp path. Returns the local file path.
 */
async function downloadFile(drive, fileId, fileName) {
  const dest = path.join(os.tmpdir(), fileName);
  const destStream = fs.createWriteStream(dest);

  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "stream" }
  );

  await new Promise((resolve, reject) => {
    res.data.pipe(destStream);
    res.data.on("error", reject);
    destStream.on("finish", resolve);
  });

  return dest;
}

/**
 * Move a file from Upload → Post folder on Drive.
 */
async function moveToPost(drive, fileId, uploadFolderId, postFolderId) {
  await drive.files.update({
    fileId,
    addParents: postFolderId,
    removeParents: uploadFolderId,
    fields: "id, parents",
  });
  console.log(`Moved file ${fileId} to Post folder.`);
}

// ─── AI Caption ─────────────────────────────────────────────────────────────
async function generateCaption() {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `
    Generate a short Mobile Legends hero output in this exact structure:
    HERO: {hero name only, no extra text}
    CAPTION: **Who is {hero name}?** {Short description of that hero}
    Requirements:
    - Random Mobile Legends hero name
    - Description must be 1–5 sentences only
    - Description must be motivational/inspirational
    - Use emojis
    - Add hashtags related to Mobile Legends
    `,
  });

  const text = response.text.trim();
  const heroMatch = text.match(/HERO:\s*(.+)/i);
  const captionMatch = text.match(/CAPTION:\s*([\s\S]+)/i);

  return {
    heroName: heroMatch?.[1].trim() ?? null,
    caption: captionMatch?.[1].trim() ?? text,
  };
}

// ─── Hero Image Fallback ─────────────────────────────────────────────────────
async function getHeroImage(heroName) {
  try {
    const res = await axios.get(
      `https://openmlbb.fastapicloud.dev/api/heroes/${encodeURIComponent(heroName)}`
    );
    return res.data?.data?.records?.[0]?.data?.head_big ?? null;
  } catch (err) {
    console.error("Could not fetch hero image:", err.message);
    return null;
  }
}

// ─── Facebook Posting ────────────────────────────────────────────────────────

/**
 * Upload a video to Facebook using the Resumable Upload API.
 * Returns the video_id on success.
 */
async function uploadVideoToFacebook(localPath, caption) {
  const fileSize = fs.statSync(localPath).size;

  // Step 1 – Initialize upload session
  const initRes = await axios.post(
    `https://graph.facebook.com/v24.0/${FB_PAGE_ID}/videos`,
    null,
    {
      params: {
        upload_phase: "start",
        file_size: fileSize,
        access_token: FB_PAGE_ACCESS_TOKEN,
      },
    }
  );

  const { upload_session_id, start_offset, end_offset, video_id } =
    initRes.data;

  // Step 2 – Transfer chunks
  let currentStart = parseInt(start_offset);
  let currentEnd = parseInt(end_offset);

  while (currentStart < fileSize) {
    const chunk = fs.createReadStream(localPath, {
      start: currentStart,
      end: currentEnd - 1,
    });

    const { default: FormData } = await import("form-data");
    const form = new FormData();
    form.append("upload_phase", "transfer");
    form.append("upload_session_id", upload_session_id);
    form.append("start_offset", String(currentStart));
    form.append("video_file_chunk", chunk, {
      filename: path.basename(localPath),
      contentType: "video/mp4",
    });
    form.append("access_token", FB_PAGE_ACCESS_TOKEN);

    const transferRes = await axios.post(
      `https://graph.facebook.com/v24.0/${FB_PAGE_ID}/videos`,
      form,
      { headers: form.getHeaders() }
    );

    currentStart = parseInt(transferRes.data.start_offset);
    currentEnd = parseInt(transferRes.data.end_offset);
  }

  // Step 3 – Finish
  await axios.post(
    `https://graph.facebook.com/v24.0/${FB_PAGE_ID}/videos`,
    null,
    {
      params: {
        upload_phase: "finish",
        upload_session_id,
        description: caption,
        access_token: FB_PAGE_ACCESS_TOKEN,
      },
    }
  );

  console.log("Video posted to Facebook! Video ID:", video_id);
  return video_id;
}

async function postImageToFacebook(caption, imageUrl) {
  const url = `https://graph.facebook.com/v24.0/${FB_PAGE_ID}/photos`;
  const res = await axios.post(url, {
    url: imageUrl,
    message: caption,
    access_token: FB_PAGE_ACCESS_TOKEN,
  });
  console.log("Posted with hero image! Post ID:", res.data.id);
}

async function postTextToFacebook(caption) {
  const url = `https://graph.facebook.com/v24.0/${FB_PAGE_ID}/feed`;
  const res = await axios.post(url, {
    message: caption,
    access_token: FB_PAGE_ACCESS_TOKEN,
  });
  console.log("Posted (text only)! Post ID:", res.data.id);
}

// ─── Main Run ────────────────────────────────────────────────────────────────
async function run() {
  console.log("\n─── Run started at", new Date().toLocaleString(), "───");

  // 1. Generate caption + hero name
  console.log("Generating caption...");
  const { heroName, caption } = await generateCaption();
  console.log("Hero:", heroName);
  console.log("Caption:\n", caption);

  // 2. Check Google Drive Upload folder for videos
  let postedViaVideo = false;

  try {
    const drive = getDriveClient();
    const { uploadFolderId, postFolderId } = await ensureFolders(drive);
    const videos = await listUploadedVideos(drive, uploadFolderId);

    if (videos.length > 0) {
      // Take the first video in the queue
      const video = videos[0];
      console.log(`Found video to post: ${video.name}`);

      // Download to temp
      console.log("Downloading video from Drive...");
      const localPath = await downloadFile(drive, video.id, video.name);

      // Upload to Facebook
      console.log("Uploading video to Facebook...");
      await uploadVideoToFacebook(localPath, caption);
      postedViaVideo = true;

      // Clean up temp file
      fs.unlinkSync(localPath);

      // Move to Post folder on Drive
      await moveToPost(drive, video.id, uploadFolderId, postFolderId);
    } else {
      console.log("No videos in Upload folder. Falling back to image/text post.");
    }
  } catch (driveErr) {
    console.error("Google Drive error (skipping video):", driveErr.message);
  }

  // 3. Fallback — post hero image or text if no video was posted
  if (!postedViaVideo) {
    let imageUrl = null;
    if (heroName) {
      console.log("Fetching hero image...");
      imageUrl = await getHeroImage(heroName);
      console.log("Image URL:", imageUrl ?? "Not found");
    }

    try {
      if (imageUrl) {
        await postImageToFacebook(caption, imageUrl);
      } else {
        await postTextToFacebook(caption);
      }
    } catch (err) {
      console.error(
        "Error posting to Facebook:",
        err.response?.data ?? err.message
      );
    }
  }

  console.log("─── Run complete ───\n");
}

// ─── Entry Point ─────────────────────────────────────────────────────────────
run();

// Uncomment for 2-min testing:
// schedule.scheduleJob('*/2 * * * *', () => {
//   console.log("Scheduled job triggered at", new Date().toLocaleString());
//   run();
// });

schedule.scheduleJob("0 6,18 * * *", () => {
  console.log("Scheduled job triggered at", new Date().toLocaleString());
  run();
});