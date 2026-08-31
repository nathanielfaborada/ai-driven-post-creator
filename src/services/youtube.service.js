import { google } from "googleapis";
import { Readable } from "stream";
import { config } from "../config/env.js";

const clientId = config.youtube?.clientId;
const clientSecret = config.youtube?.clientSecret;
const refreshToken = config.youtube?.refreshToken;

let oauth2Client = null;
let youtube = null;

if (clientId && clientSecret && refreshToken) {
  oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    "https://developers.google.com/oauthplayground"
  );

  oauth2Client.setCredentials({
    refresh_token: refreshToken,
  });

  youtube = google.youtube({
    version: "v3",
    auth: oauth2Client,
  });

  console.log("[YouTube Service] 📺 Initialized YouTube Data API v3 OAuth2 Client.");
} else {
  console.warn("[YouTube Service] ⚠️ Missing YouTube OAuth2 credentials in configuration.");
}

/**
 * Verify YouTube Channel connection and fetch basic channel info.
 * @returns {Promise<{ success: boolean, channelTitle?: string, customUrl?: string, error?: string }>}
 */
export async function verifyYouTubeConnection() {
  if (!youtube) {
    return { success: false, error: "YouTube client not initialized. Missing credentials." };
  }

  try {
    const res = await youtube.channels.list({
      part: ["snippet", "statistics"],
      mine: true,
    });

    const items = res.data?.items || [];
    if (items.length === 0) {
      return { success: false, error: "No YouTube channel found for authenticated account." };
    }

    const channel = items[0];
    const channelTitle = channel.snippet?.title;
    const customUrl = channel.snippet?.customUrl || `@${channelTitle}`;

    console.log(`[YouTube Service] ✅ Connected to YouTube Channel: "${channelTitle}" (${customUrl})`);
    return {
      success: true,
      channelTitle,
      customUrl,
      subscriberCount: channel.statistics?.subscriberCount,
      videoCount: channel.statistics?.videoCount,
    };
  } catch (err) {
    const errorMsg = err.response?.data?.error?.message || err.message;
    console.error("[YouTube Service] ❌ Failed to connect to YouTube Channel:", errorMsg);
    return { success: false, error: errorMsg };
  }
}

/**
 * Upload and publish a vertical short video to YouTube Shorts.
 * @param {Object} params
 * @param {Buffer} params.videoBuffer - Binary buffer of the video file
 * @param {string} params.title - Title of the YouTube Short (Max 100 chars, includes #Shorts)
 * @param {string} [params.description] - Description of the video
 * @param {string[]} [params.tags] - Array of SEO keyword tags
 * @param {"public"|"unlisted"|"private"} [params.privacyStatus] - Video privacy
 * @returns {Promise<{ success: boolean, videoId: string|null, url?: string, error?: any }>}
 */
export async function publishYouTubeShort({
  videoBuffer,
  title,
  description = "",
  tags = ["Shorts", "Science", "Technology", "NanoFacts", "STEM"],
  privacyStatus = "public",
}) {
  if (!youtube) {
    console.error("[YouTube Service] Cannot upload video: YouTube client is not initialized.");
    return { success: false, videoId: null, error: "YouTube client not initialized" };
  }

  if (!videoBuffer || !title) {
    console.error("[YouTube Service] Missing required params (videoBuffer or title).");
    return { success: false, videoId: null, error: "Missing videoBuffer or title" };
  }

  try {
    // Ensure title contains #Shorts for automatic YouTube Shorts categorization
    let shortTitle = title.trim();
    if (!shortTitle.toLowerCase().includes("#shorts")) {
      shortTitle = `${shortTitle} #Shorts`;
    }
    // Enforce YouTube 100 character limit on title
    if (shortTitle.length > 100) {
      shortTitle = shortTitle.slice(0, 92).trim() + " #Shorts";
    }

    console.log(`\n[YouTube Shorts] 🚀 Uploading Short to YouTube Channel...`);
    console.log(`[YouTube Shorts] 📌 Title: "${shortTitle}"`);
    console.log(`[YouTube Shorts] 📦 Size: ${(videoBuffer.length / (1024 * 1024)).toFixed(2)} MB`);

    const readableStream = new Readable();
    readableStream.push(videoBuffer);
    readableStream.push(null);

    const res = await youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: {
          title: shortTitle,
          description: description || "",
          tags: tags || ["Shorts", "Science", "NanoFacts"],
          categoryId: "28", // Category 28: Science & Technology
          defaultLanguage: "en",
        },
        status: {
          privacyStatus,
          selfDeclaredMadeForKids: false,
        },
      },
      media: {
        body: readableStream,
      },
    });

    const videoId = res.data?.id;
    const shortUrl = `https://youtube.com/shorts/${videoId}`;

    console.log(`[YouTube Shorts] ✅ Successfully published YouTube Short! Video ID: ${videoId}`);
    console.log(`[YouTube Shorts] 🔗 Link: ${shortUrl}`);

    return {
      success: true,
      videoId,
      url: shortUrl,
      data: res.data,
    };
  } catch (err) {
    const errorDetails = err.response?.data?.error || err.message;
    console.error("[YouTube Shorts] ❌ Error publishing to YouTube:", errorDetails);
    return {
      success: false,
      videoId: null,
      error: errorDetails,
    };
  }
}
