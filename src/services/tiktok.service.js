import axios from "axios";
import { config } from "../config/env.js";

const clientKey = process.env.TIKTOK_CLIENT_KEY;
const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
let refreshToken = process.env.TIKTOK_REFRESH_TOKEN;

let cachedAccessToken = null;
let tokenExpiresAt = 0;

/**
 * Obtain a valid Access Token using the Refresh Token.
 * @returns {Promise<string|null>}
 */
export async function getTikTokAccessToken() {
  if (!clientKey || !clientSecret || !refreshToken) {
    return null;
  }

  // Use cached token if valid (with 5-minute buffer)
  if (cachedAccessToken && Date.now() < tokenExpiresAt - 300000) {
    return cachedAccessToken;
  }

  try {
    const res = await axios.post(
      "https://open.tiktokapis.com/v2/oauth/token/",
      new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Cache-Control": "no-cache",
        },
      }
    );

    const data = res.data?.data || res.data;
    if (data.access_token) {
      cachedAccessToken = data.access_token;
      tokenExpiresAt = Date.now() + (data.expires_in || 86400) * 1000;
      if (data.refresh_token) {
        refreshToken = data.refresh_token;
      }
      return cachedAccessToken;
    }

    console.error("[TikTok Service] ❌ Failed to refresh token:", res.data);
    return null;
  } catch (err) {
    console.error("[TikTok Service] ❌ Token refresh error:", err.response?.data || err.message);
    return null;
  }
}

/**
 * Publish a vertical video to TikTok using Content Posting API (Direct Post / Upload).
 * @param {Object} params
 * @param {Buffer} params.videoBuffer - Binary buffer of the video
 * @param {string} params.title - Caption/title with hashtags (Max 2200 chars)
 * @param {"PUBLIC_TO_EVERYONE"|"MUTUAL_FOLLOW_FRIENDS"|"SELF_ONLY"} [params.privacyLevel]
 * @returns {Promise<{ success: boolean, publishId?: string, error?: any }>}
 */
export async function publishTikTokVideo({
  videoBuffer,
  title,
  privacyLevel = "PUBLIC_TO_EVERYONE",
}) {
  const accessToken = await getTikTokAccessToken();
  if (!accessToken) {
    console.error("[TikTok Service] Cannot publish: Missing or invalid TikTok access token.");
    return { success: false, error: "Missing or invalid TikTok access token" };
  }

  if (!videoBuffer || !title) {
    console.error("[TikTok Service] Missing required params (videoBuffer or title).");
    return { success: false, error: "Missing videoBuffer or title" };
  }

  try {
    console.log(`\n[TikTok Video] 🚀 Phase 1: Initializing TikTok upload session (${(videoBuffer.length / (1024 * 1024)).toFixed(2)} MB)...`);

    // Clean caption and ensure trending hashtags
    let cleanCaption = title.trim();
    if (!cleanCaption.toLowerCase().includes("#fyp")) {
      cleanCaption = `${cleanCaption} #fyp #foryou #ScienceTok #NanoFacts #STEM`;
    }

    // 1. Initialize Direct Post Upload
    const initRes = await axios.post(
      "https://open.tiktokapis.com/v2/post/publish/video/init/",
      {
        post_info: {
          title: cleanCaption.slice(0, 2000),
          privacy_level: privacyLevel,
          disable_duet: false,
          disable_stitch: false,
          disable_comment: false,
          video_cover_timestamp_ms: 1000,
        },
        source_info: {
          source: "FILE_UPLOAD",
          video_size: videoBuffer.length,
          chunk_size: videoBuffer.length,
          total_chunk_count: 1,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
      }
    );

    const publishData = initRes.data?.data;
    const publishId = publishData?.publish_id;
    const uploadUrl = publishData?.upload_url;

    if (!uploadUrl) {
      throw new Error(`Failed to get upload_url: ${JSON.stringify(initRes.data)}`);
    }

    // 2. Upload Video Binary Chunk
    console.log(`[TikTok Video] 📦 Phase 2: Transferring video binary (${videoBuffer.length} bytes)...`);
    await axios.put(uploadUrl, videoBuffer, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Range": `bytes 0-${videoBuffer.length - 1}/${videoBuffer.length}`,
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });

    console.log(`[TikTok Video] ✅ Successfully uploaded to TikTok! (Publish ID: ${publishId})`);
    return {
      success: true,
      publishId,
      data: publishData,
    };
  } catch (err) {
    const errorDetails = err.response?.data || err.message;
    console.error("[TikTok Video] ❌ Error publishing to TikTok:", errorDetails);
    return {
      success: false,
      error: errorDetails,
    };
  }
}
