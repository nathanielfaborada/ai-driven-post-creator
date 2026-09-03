import { getRecentPostsWithComments, replyToComment } from "../services/facebook.service.js";
import { generateCommentReply } from "../services/ai.service.js";
import { getRepliedCommentIds, markCommentAsReplied } from "../utils/storage.js";
import { config } from "../config/env.js";

// Only reply to comments posted within the last 24 hours
const MAX_COMMENT_AGE_HOURS = 24;

// Wait a random number of seconds (40 to 75s) so our replies look natural like a real person
function getRandomDelay(minSec = 40, maxSec = 75) {
  const seconds = Math.floor(Math.random() * (maxSec - minSec + 1)) + minSec;
  return seconds * 1000;
}

// Check recent posts for a Facebook page, find comments, and write AI replies
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

        // Skip if we already replied to this comment before
        if (repliedIds.has(commentId)) {
          continue;
        }

        // Do not reply to our own page's comments
        if (commenterId && commenterId === pageConfig.pageId) {
          markCommentAsReplied(commentId);
          continue;
        }

        // Skip if the page already answered under this thread
        const subComments = comment.comments?.data || [];
        const alreadyAnsweredByPage = subComments.some(
          (sub) => sub.from?.id === pageConfig.pageId
        );
        if (alreadyAnsweredByPage) {
          markCommentAsReplied(commentId);
          continue;
        }

        // Skip stickers or blank comments with no text
        if (!commentMessage) {
          markCommentAsReplied(commentId);
          continue;
        }

        // Ignore old comments made more than 24 hours ago
        if (comment.created_time) {
          const commentAgeHours = (Date.now() - new Date(comment.created_time).getTime()) / (1000 * 60 * 60);
          if (commentAgeHours > MAX_COMMENT_AGE_HOURS) {
            markCommentAsReplied(commentId);
            continue;
          }
        }

        console.log(`\n[Comment Responder] [INFO] New comment on ${pageTitle} by ${comment.from?.name || "User"}: "${commentMessage}"`);

        // Wait between 40 to 75 seconds before posting so it does not look like an instant bot
        const delayMs = getRandomDelay(40, 75);
        const delaySec = Math.round(delayMs / 1000);
        console.log(`[Comment Responder] [INFO] Waiting ${delaySec}s before replying to maintain natural human pacing...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));

        // Ask Gemini AI to write a friendly reply
        const aiReply = await generateCommentReply({
          userComment: commentMessage,
          postTopic: postCaption,
          page: pageKey,
          userName: comment.from?.name || null,
        });

        if (aiReply) {
          console.log(`[${pageTitle}] AI generated response:\n"${aiReply}"`);
          
          // Post the reply to Facebook
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

// Check for new comments across both Asta Plays and Nano Facts at the same time
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
