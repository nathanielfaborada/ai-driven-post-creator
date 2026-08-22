import { generateCaptionNanoFacts } from "../services/ai.service.js";
import { postToFacebook } from "../services/facebook.service.js";
import { toUnicodeBold } from "../utils/formatters.js";
import { config } from "../config/env.js";

/**
 * Execute the Nano Facts posting workflow.
 */
export async function runNanoJob() {
  console.log("\n[Nano Facts] Generating caption...");
  const { elementName, caption } = await generateCaptionNanoFacts();

  if (!caption) {
    console.log("[Nano Facts] No caption generated, aborting this run.");
    return;
  }

  console.log("[Nano Facts] Element:", elementName);
  console.log("[Nano Facts] Caption:\n", caption);

  console.log("[Nano Facts] Posting to Facebook...");
  const formattedCaption = toUnicodeBold(caption);
  await postToFacebook({
    caption: formattedCaption,
    imageUrl: null,
    pageId: config.nanoFacts.pageId,
    pageToken: config.nanoFacts.pageToken,
  });
}
