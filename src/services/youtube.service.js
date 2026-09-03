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

  console.log("[YouTube Service] [INFO] Initialized YouTube Data API v3 OAuth2 Client.");
} else {
  console.warn("[YouTube Service] [WARN] Missing YouTube OAuth2 credentials in configuration.");
}

// Check if our YouTube channel is connected and get its name
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

    console.log(`[YouTube Service] [SUCCESS] Connected to YouTube Channel: "${channelTitle}" (${customUrl})`);
    return {
      success: true,
      channelTitle,
      customUrl,
      subscriberCount: channel.statistics?.subscriberCount,
      videoCount: channel.statistics?.videoCount,
    };
  } catch (err) {
    const errorMsg = err.response?.data?.error?.message || err.message;
    console.error("[YouTube Service] [ERROR] Failed to connect to YouTube Channel:", errorMsg);
    return { success: false, error: errorMsg };
  }
}

// Upload and publish a vertical video directly to YouTube Shorts
export async function publishYouTubeShort({
  videoBuffer,
  title,
  description = "",
  tags = ["Shorts", "Science", "Technology", "NanoFacts", "STEM"],
  privacyStatus = "public",
}) {
  if (!youtube) {
    console.error("[YouTube Service] [ERROR] Cannot upload video: YouTube client is not initialized.");
    return { success: false, videoId: null, error: "YouTube client not initialized" };
  }

  if (!videoBuffer || !title) {
    console.error("[YouTube Service] [ERROR] Missing required params (videoBuffer or title).");
    return { success: false, videoId: null, error: "Missing videoBuffer or title" };
  }

  try {
    // Make sure the title has #Shorts at the end so YouTube treats it as a Short
    let shortTitle = title.trim();
    if (!shortTitle.toLowerCase().includes("#shorts")) {
      shortTitle = `${shortTitle} #Shorts`;
    }
    // Keep the title under 100 characters so YouTube does not reject it
    if (shortTitle.length > 100) {
      shortTitle = shortTitle.slice(0, 92).trim() + " #Shorts";
    }

    console.log(`\n[YouTube Shorts] [INFO] Uploading Short to YouTube Channel...`);
    console.log(`[YouTube Shorts] [INFO] Title: "${shortTitle}"`);
    console.log(`[YouTube Shorts] [INFO] Size: ${(videoBuffer.length / (1024 * 1024)).toFixed(2)} MB`);

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

    console.log(`[YouTube Shorts] [SUCCESS] Successfully published YouTube Short. Video ID: ${videoId}`);
    console.log(`[YouTube Shorts] [INFO] Link: ${shortUrl}`);

    return {
      success: true,
      videoId,
      url: shortUrl,
      data: res.data,
    };
  } catch (err) {
    const errorDetails = err.response?.data?.error || err.message;
    console.error("[YouTube Shorts] [ERROR] Error publishing to YouTube:", errorDetails);
    return {
      success: false,
      videoId: null,
      error: errorDetails,
    };
  }
}
