import { generateCaptionAstaPlays } from "../services/ai.service.js";
import { postToFacebook } from "../services/facebook.service.js";
import { config } from "../config/env.js";

// Generate an AI gaming post for Asta Plays and publish it to Facebook
export async function runAstaJob() {
  console.log("\n[Asta Plays] Generating caption...");
  const { heroName, caption } = await generateCaptionAstaPlays();

  if (!caption) {
    console.log("[Asta Plays] No caption generated, aborting this run.");
    return;
  }

  console.log("[Asta Plays] Hero:", heroName);
  console.log("[Asta Plays] Caption:\n", caption);

  console.log("[Asta Plays] Posting to Facebook (Text Only)...");
  await postToFacebook({
    caption,
    imageUrl: null,
    imageBuffer: null,
    pageId: config.astaPlays.pageId,
    pageToken: config.astaPlays.pageToken,
  });
}
