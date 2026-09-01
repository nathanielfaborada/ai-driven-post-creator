import { getRecentPostsWithComments, replyToComment } from "../services/facebook.service.js";
import { generateCommentReply } from "../services/ai.service.js";
import { getRepliedCommentIds, markCommentAsReplied } from "../utils/storage.js";
import { config } from "../config/env.js";

// Only reply to comments created in the last 24 hours
const MAX_COMMENT_AGE_HOURS = 24;

/**
 * Generate a random human-like delay between min and max seconds.
 * @param {number} minSec 
 * @param {number} maxSec 
 * @returns {number} Delay in milliseconds
 */
function getRandomDelay(minSec = 40, maxSec = 75) {
  const seconds = Math.floor(Math.random() * (maxSec - minSec + 1)) + minSec;
  return seconds * 1000;
}

/**
 * Process unreplied comments for a specific Facebook Page.
 * @param {Object} params
 * @param {string} params.pageKey - Key in config (e.g. "astaPlays" or "nanoFacts")
 * @param {string} params.pageTitle - Display name for logging
 * @param {string} params.postTopic - General topic context for AI
 */
async function processCommentsForPage({ pageKey, pageTitle, postTopic }) {
  const pageConfig = config[pageKey];
  if (!pageConfig?.pageId || !pageConfig?.pageToken) {
    return;
  }

  const repliedIds = getRepliedCommentIds();
  const posts = await getRecentPostsWithComments({
    pageId: pageConfig.pageId,
    pageToken: pageConfig.pageToken,
    limit: 10,
  });

  for (const post of posts) {
    const comments = post.comments?.data || [];
    const postCaption = post.message || postTopic;

    for (const comment of comments) {
      try {
        const commentId = comment.id;
        const commentMessage = comment.message?.trim();
        const commenterId = comment.from?.id;

        // 1. Skip if already replied in our local database
        if (repliedIds.has(commentId)) {
          continue;
        }

        // 2. Skip if comment is from the page itself
        if (commenterId && commenterId === pageConfig.pageId) {
          markCommentAsReplied(commentId);
          continue;
        }

        // 3. Skip if there is already a sub-comment reply from the page
        const subComments = comment.comments?.data || [];
        const alreadyAnsweredByPage = subComments.some(
          (sub) => sub.from?.id === pageConfig.pageId
        );
        if (alreadyAnsweredByPage) {
          markCommentAsReplied(commentId);
          continue;
        }

        // 4. Skip empty comments (e.g., sticker only or GIF without text)
        if (!commentMessage) {
          markCommentAsReplied(commentId);
          continue;
        }

        // 5. Time Filter: Skip comments older than 24 hours
        if (comment.created_time) {
          const commentAgeHours = (Date.now() - new Date(comment.created_time).getTime()) / (1000 * 60 * 60);
          if (commentAgeHours > MAX_COMMENT_AGE_HOURS) {
            markCommentAsReplied(commentId);
            continue;
          }
        }

        console.log(`\n[Comment Responder] [INFO] New comment on ${pageTitle} by ${comment.from?.name || "User"}: "${commentMessage}"`);

        // Human-paced natural delay before posting the reply (40 - 75 seconds)
        const delayMs = getRandomDelay(40, 75);
        const delaySec = Math.round(delayMs / 1000);
        console.log(`[Comment Responder] [INFO] Waiting ${delaySec}s before replying to maintain natural human pacing...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));

        // 6. Generate AI response
        const aiReply = await generateCommentReply({
          userComment: commentMessage,
          postTopic: postCaption,
          page: pageKey,
          userName: comment.from?.name || null,
        });

        if (aiReply) {
          console.log(`[${pageTitle}] AI generated response:\n"${aiReply}"`);
          
          // 7. Post reply to Facebook
          const replyId = await replyToComment({
            commentId,
            message: aiReply,
            pageToken: pageConfig.pageToken,
          });

          if (replyId) {
            markCommentAsReplied(commentId);
            console.log(`[${pageTitle}] [SUCCESS] Reply sent successfully to ${comment.from?.name || "User"}.`);
          }
        }
      } catch (commentErr) {
        console.error(`[${pageTitle}] [ERROR] Error processing comment ${comment?.id}:`, commentErr.message);
      }
    }
  }
}

let isProcessing = false;

/**
 * Main job runner to check and reply to comments across all managed pages in parallel.
 */
export async function runCommentResponderJob() {
  if (isProcessing) {
    console.log("[Comment Responder] Job is already running, skipping this tick...");
    return;
  }

  isProcessing = true;
  try {
    const results = await Promise.allSettled([
      processCommentsForPage({
        pageKey: "astaPlays",
        pageTitle: "Asta Plays",
        postTopic: "Mobile Legends: Bang Bang gameplay, hero tips, and build guides",
      }),
      processCommentsForPage({
        pageKey: "nanoFacts",
        pageTitle: "Nano Facts",
        postTopic: "Science, chemistry, and periodic table facts",
      }),
    ]);

    results.forEach((result, index) => {
      if (result.status === "rejected") {
        const page = index === 0 ? "Asta Plays" : "Nano Facts";
        console.error(`[Comment Responder] Unexpected failure for ${page}:`, result.reason);
      }
    });
  } catch (err) {
    console.error("[Comment Responder] Unexpected error in job:", err.message);
  } finally {
    isProcessing = false;
  }
}
