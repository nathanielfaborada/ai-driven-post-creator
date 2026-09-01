import axios from "axios";

const GRAPH_API_VERSION = "v26.0";
const BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/**
 * Post a photo or text caption to Facebook Page Feed.
 * @param {Object} params
 * @param {string} params.caption
 * @param {string|null} [params.imageUrl]
 * @param {Buffer|null} [params.imageBuffer]
 * @param {string} params.pageId
 * @param {string} params.pageToken
 * @returns {Promise<string|null>} Created Post ID
 */
export async function postToFacebook({ caption, imageUrl, imageBuffer, pageId, pageToken }) {
  if (!caption) {
    console.log("[Facebook Service] No caption generated, skipping post.");
    return null;
  }
  if (!pageId || !pageToken) {
    console.error("[Facebook Service] Missing pageId or pageToken, skipping post.");
    return null;
  }

  try {
    if (imageBuffer) {
      // Post with raw image Buffer from Google Imagen
      const formData = new FormData();
      formData.append("source", new Blob([imageBuffer], { type: "image/jpeg" }), "image.jpg");
      formData.append("message", caption);
      formData.append("access_token", pageToken);

      const url = `${BASE_URL}/${pageId}/photos`;
      const res = await axios.post(url, formData);
      console.log("[Facebook Service] [SUCCESS] Posted with image. Post ID:", res.data.id);
      return res.data.id;
    } else if (imageUrl) {
      // Post with image URL using Photos API
      const url = `${BASE_URL}/${pageId}/photos`;
      const res = await axios.post(url, {
        url: imageUrl,
        message: caption,
        access_token: pageToken,
      });
      console.log("[Facebook Service] [SUCCESS] Posted with image. Post ID:", res.data.id);
      return res.data.id;
    } else {
      // Fallback: post text only
      const url = `${BASE_URL}/${pageId}/feed`;
      const res = await axios.post(url, {
        message: caption,
        access_token: pageToken,
      });
      console.log("[Facebook Service] [SUCCESS] Posted (text only). Post ID:", res.data.id);
      return res.data.id;
    }
  } catch (err) {
    console.error("[Facebook Service] [ERROR] Error posting to Facebook:", err.response?.data || err.message);
    return null;
  }
}

/**
 * Fetch recent posts (including feed posts and video reels) along with their comments for a Facebook Page.
 * @param {Object} params
 * @param {string} params.pageId
 * @param {string} params.pageToken
 * @param {number} [params.limit]
 * @returns {Promise<Array>} Array of posts and videos with comments
 */
export async function getRecentPostsWithComments({ pageId, pageToken, limit = 10 }) {
  if (!pageId || !pageToken) {
    console.error("[Facebook Service] Missing pageId or pageToken for fetching comments.");
    return [];
  }

  const postsMap = new Map();

  // 1. Fetch Feed posts (Status, Photos, Shared Posts)
  try {
    const feedUrl = `${BASE_URL}/${pageId}/feed`;
    const res = await axios.get(feedUrl, {
      params: {
        fields: "id,message,created_time,comments.limit(25){id,message,from,created_time,comments{id,from}}",
        limit,
        access_token: pageToken,
      },
    });

    const feedPosts = res.data?.data || [];
    for (const post of feedPosts) {
      if (post.id) {
        postsMap.set(post.id, post);
      }
    }
  } catch (err) {
    console.error(`[Facebook Service] Error fetching feed posts for page ${pageId}:`, err.response?.data || err.message);
  }

  // 2. Fetch Video / Reels posts (Facebook Reels and uploaded videos)
  try {
    const videosUrl = `${BASE_URL}/${pageId}/videos`;
    const res = await axios.get(videosUrl, {
      params: {
        fields: "id,description,title,created_time,comments.limit(25){id,message,from,created_time,comments{id,from}}",
        limit,
        access_token: pageToken,
      },
    });

    const videoPosts = res.data?.data || [];
    for (const video of videoPosts) {
      if (video.id && !postsMap.has(video.id)) {
        postsMap.set(video.id, {
          ...video,
          message: video.description || video.title || video.message || "",
        });
      }
    }
  } catch (err) {
    console.warn(`[Facebook Service] Note: Could not fetch video reels for page ${pageId}:`, err.response?.data?.error?.message || err.message);
  }

  return Array.from(postsMap.values());
}

/**
 * Reply to a specific Facebook comment.
 * @param {Object} params
 * @param {string} params.commentId
 * @param {string} params.message
 * @param {string} params.pageToken
 * @returns {Promise<string|null>} Created Reply Comment ID
 */
export async function replyToComment({ commentId, message, pageToken }) {
  if (!commentId || !message || !pageToken) {
    console.error("[Facebook Service] Missing commentId, message, or pageToken for reply.");
    return null;
  }

  try {
    const url = `${BASE_URL}/${commentId}/comments`;
    const res = await axios.post(url, {
      message,
      access_token: pageToken,
    });
    console.log("[Facebook Service] [SUCCESS] Successfully replied to comment. Reply ID:", res.data.id);
    return res.data.id;
  } catch (err) {
    console.error("[Facebook Service] [ERROR] Error replying to comment:", err.response?.data || err.message);
    return null;
  }
}

/**
 * Publish a video Reel to a Facebook Page using the 3-step Reels API.
 * @param {Object} params
 * @param {Buffer} params.videoBuffer - Binary buffer of the video file
 * @param {string} [params.caption] - Caption/description of the reel
 * @param {string} params.pageId - Facebook Page ID
 * @param {string} params.pageToken - Facebook Page Access Token
 * @returns {Promise<{ success: boolean, videoId: string|null, error?: any }>}
 */
export async function publishFacebookReel({ videoBuffer, caption = "", pageId, pageToken }) {
  if (!videoBuffer || !pageId || !pageToken) {
    console.error("[FB Reels] [ERROR] Missing required params (videoBuffer, pageId, or pageToken).");
    return { success: false, videoId: null, error: "Missing required parameters" };
  }

  try {
    console.log("[FB Reels] [INFO] Phase 1: Initializing Reels upload session...");
    const initRes = await axios.post(`${BASE_URL}/${pageId}/video_reels`, {
      upload_phase: "start",
      access_token: pageToken,
    });

    const { video_id, upload_url } = initRes.data;
    if (!video_id || !upload_url) {
      throw new Error(`Failed to initialize upload session: ${JSON.stringify(initRes.data)}`);
    }

    console.log(`[FB Reels] [INFO] Session initialized. Video ID: ${video_id}. Phase 2: Uploading ${videoBuffer.length} bytes...`);
    await axios.post(upload_url, videoBuffer, {
      headers: {
        Authorization: `OAuth ${pageToken}`,
        offset: 0,
        file_size: videoBuffer.length,
        "Content-Type": "application/octet-stream",
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });

    console.log("[FB Reels] [INFO] Phase 3: Finishing and publishing Reel...");
    const finishRes = await axios.post(`${BASE_URL}/${pageId}/video_reels`, {
      upload_phase: "finish",
      video_id: video_id,
      video_state: "PUBLISHED",
      description: caption || "",
      access_token: pageToken,
    });

    console.log(`[FB Reels] [SUCCESS] Successfully published Reel. Video ID: ${video_id}`);
    return { success: true, videoId: video_id, data: finishRes.data };
  } catch (err) {
    const errorDetails = err.response?.data || err.message;
    console.error("[FB Reels] [ERROR] Error publishing Facebook Reel:", errorDetails);
    return { success: false, videoId: null, error: errorDetails };
  }
}
