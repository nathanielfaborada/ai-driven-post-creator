import "dotenv/config";
import { getTikTokAccessToken } from "../src/services/tiktok.service.js";
import axios from "axios";

async function test() {
  console.log("Testing TikTok Connection...");
  const token = await getTikTokAccessToken();
  if (!token) {
    console.error("❌ Failed to get TikTok access token.");
    process.exit(1);
  }

  console.log("✅ Got TikTok Access Token:", token.slice(0, 15) + "...");

  try {
    const res = await axios.get("https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    console.log("User Info Response:", JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.warn("User info fetch note:", err.response?.data || err.message);
  }

  process.exit(0);
}

test();
