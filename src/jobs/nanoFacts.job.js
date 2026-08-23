import { generateCaptionNanoFacts } from "../services/ai.service.js";
import { postToFacebook } from "../services/facebook.service.js";
import { config } from "../config/env.js";

/**
 * Execute the Nano Facts posting workflow.
 */
export async function runNanoJob() {
  console.log("\n[Nano Facts] Generating caption...");
  const { topicName, elementName, caption } = await generateCaptionNanoFacts();

  if (!caption) {
    console.log("[Nano Facts] No caption generated, aborting this run.");
    return;
  }

  console.log("[Nano Facts] Topic:", topicName || elementName);
  console.log("[Nano Facts] Caption:\n", caption);

  console.log("[Nano Facts] Posting to Facebook (Text Only)...");
  await postToFacebook({
    caption,
    imageUrl: null,
    pageId: config.nanoFacts.pageId,
    pageToken: config.nanoFacts.pageToken,
  });
}
