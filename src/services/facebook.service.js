import axios from "axios";

const GRAPH_API_VERSION = "v26.0";
const BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/**
 * Post a photo or text caption to Facebook Page Feed.
 * @param {Object} params
 * @param {string} params.caption
 * @param {string|null} [params.imageUrl]
 * @param {string} params.pageId
 * @param {string} params.pageToken
 * @returns {Promise<string|null>} Created Post ID
 */
export async function postToFacebook({ caption, imageUrl, pageId, pageToken }) {
  if (!caption) {
    console.log("No caption generated, skipping post.");
    return null;
  }
  if (!pageId || !pageToken) {
    console.error("Missing pageId or pageToken, skipping post.");
    return null;
  }

  try {
    if (imageUrl) {
      // Post with image using Photos API
      const url = `${BASE_URL}/${pageId}/photos`;
      const res = await axios.post(url, {
        url: imageUrl,
        message: caption,
        access_token: pageToken,
      });
      console.log("Posted with image! Post ID:", res.data.id);
      return res.data.id;
    } else {
      // Fallback: post text only
      const url = `${BASE_URL}/${pageId}/feed`;
      const res = await axios.post(url, {
        message: caption,
        access_token: pageToken,
      });
      console.log("Posted (text only)! Post ID:", res.data.id);
      return res.data.id;
    }
  } catch (err) {
    console.error("Error posting to Facebook:", err.response?.data || err.message);
    return null;
  }
}

/**
 * Fetch recent posts along with their comments for a Facebook Page.
 * @param {Object} params
 * @param {string} params.pageId
 * @param {string} params.pageToken
 * @param {number} [params.limit]
 * @returns {Promise<Array>} Array of posts with comments
 */
export async function getRecentPostsWithComments({ pageId, pageToken, limit = 5 }) {
  if (!pageId || !pageToken) {
    console.error("Missing pageId or pageToken for fetching comments.");
    return [];
  }

  try {
    const url = `${BASE_URL}/${pageId}/feed`;
    const res = await axios.get(url, {
      params: {
        fields: "id,message,created_time,comments.limit(25){id,message,from,created_time,comments{id,from}}",
        limit,
        access_token: pageToken,
      },
    });

    return res.data?.data || [];
  } catch (err) {
    console.error(`Error fetching posts for page ${pageId}:`, err.response?.data || err.message);
    return [];
  }
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
    console.error("Missing commentId, message, or pageToken for reply.");
    return null;
  }

  try {
    const url = `${BASE_URL}/${commentId}/comments`;
    const res = await axios.post(url, {
      message,
      access_token: pageToken,
    });
    console.log("Successfully replied to comment! Reply ID:", res.data.id);
    return res.data.id;
  } catch (err) {
    console.error("Error replying to comment:", err.response?.data || err.message);
    return null;
  }
}
