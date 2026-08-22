import { generateCaptionAstaPlays } from "../services/ai.service.js";
import { getHeroImage } from "../services/mlbb.service.js";
import { postToFacebook } from "../services/facebook.service.js";
import { toUnicodeBold } from "../utils/formatters.js";
import { config } from "../config/env.js";

/**
 * Execute the Asta Plays posting workflow.
 */
export async function runAstaJob() {
  console.log("\n[Asta Plays] Generating caption...");
  const { heroName, caption } = await generateCaptionAstaPlays();

  if (!caption) {
    console.log("[Asta Plays] No caption generated, aborting this run.");
    return;
  }

  console.log("[Asta Plays] Hero:", heroName);
  console.log("[Asta Plays] Caption:\n", caption);

  const formattedCaption = toUnicodeBold(caption);

  let imageUrl = null;
  if (heroName) {
    console.log("[Asta Plays] Fetching hero image...");
    imageUrl = await getHeroImage(heroName);
    console.log("[Asta Plays] Image URL:", imageUrl ?? "Not found, will post text only");
  }

  console.log("[Asta Plays] Posting to Facebook...");
  await postToFacebook({
    caption: formattedCaption,
    imageUrl,
    pageId: config.astaPlays.pageId,
    pageToken: config.astaPlays.pageToken,
  });
}
