import "dotenv/config";
import { verifyYouTubeConnection } from "../src/services/youtube.service.js";

async function main() {
  console.log("Testing YouTube Connection...");
  const res = await verifyYouTubeConnection();
  console.log("Result:", res);
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal Error:", err);
  process.exit(1);
});
