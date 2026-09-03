import "dotenv/config";

// Find and collect all Gemini API keys from the .env file so we can rotate them
function getGeminiApiKeys() {
  const keys = [];

  // Grab keys named GEMINI_PROJECT_1 up to GEMINI_PROJECT_50
  for (let i = 1; i <= 50; i++) {
    const key = process.env[`GEMINI_PROJECT_${i}`];
    if (key && key.trim()) {
      keys.push(key.trim());
    }
  }

  // Also grab any other custom Gemini keys in the .env file
  for (const [envKey, envVal] of Object.entries(process.env)) {
    if (
      (envKey.startsWith("GEMINI_PROJECT_") || envKey.startsWith("GEMINI_API_KEY")) &&
      envVal &&
      envVal.trim() &&
      !keys.includes(envVal.trim())
    ) {
      keys.push(envVal.trim());
    }
  }

  // Add the basic single GEMINI_API_KEY if it exists
  if (process.env.GEMINI_API_KEY && !keys.includes(process.env.GEMINI_API_KEY.trim())) {
    keys.push(process.env.GEMINI_API_KEY.trim());
  }

  return keys;
}

export const config = {
  gemini: {
    apiKeys: getGeminiApiKeys(),
  },
  supabase: {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_KEY,
  },
  youtube: {
    clientId: process.env.YOUTUBE_CLIENT_ID,
    clientSecret: process.env.YOUTUBE_CLIENT_SECRET,
    refreshToken: process.env.YOUTUBE_REFRESH_TOKEN,
  },
  tiktok: {
    clientKey: process.env.TIKTOK_CLIENT_KEY,
    clientSecret: process.env.TIKTOK_CLIENT_SECRET,
    refreshToken: process.env.TIKTOK_REFRESH_TOKEN,
    openId: process.env.TIKTOK_OPEN_ID,
  },
  astaPlays: {
    pageId: process.env.FB_PAGE_ID_ASTA_PLAYS,
    pageToken: process.env.FB_PAGE_ACCESS_TOKEN_ASTA_PLAYS,
  },
  nanoFacts: {
    pageId: process.env.FB_PAGE_ID_NANO_FACTS,
    pageToken: process.env.FB_PAGE_ACCESS_TOKEN_NANO_FACTS,
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    queueChannelId: process.env.TELEGRAM_CHANNEL_QUEUE_ID,
    // Telegram Channel IDs for our 10 science categories
    archiveChannels: {
      "Human Biology & Anatomy": process.env.TG_CHANNEL_BIOLOGY_ID || process.env.TELEGRAM_CHANNEL_ARCHIVE_BIOLOGY_ID,
      "Chemistry & Periodic Table": process.env.TG_CHANNEL_CHEMISTRY_ID || process.env.TELEGRAM_CHANNEL_ARCHIVE_PERIODIC_ID,
      "Astronomy & Deep Space": process.env.TG_CHANNEL_ASTRONOMY_ID,
      "Quantum & Modern Physics": process.env.TG_CHANNEL_PHYSICS_ID,
      "AI, Robotics & Future Technology": process.env.TG_CHANNEL_ROBOTICS_ID,
      "Deep Sea & Ocean Mysteries": process.env.TG_CHANNEL_OCEAN_ID,
      "Earth Sciences & Extreme Nature": process.env.TG_CHANNEL_EARTH_ID,
      "Materials Science & Nanotechnology": process.env.TG_CHANNEL_MATERIALS_ID,
      "Paleontology & Prehistoric Life": process.env.TG_CHANNEL_PALEONTOLOGY_ID,
      "Rocket Science & Space Missions": process.env.TG_CHANNEL_ROCKETS_ID,
    },
  },
  server: {
    port: Number(process.env.PORT) || 8080,
  },
  facebook: {
    verifyToken: process.env.FB_VERIFY_TOKEN || "my_facebook_webhook_secret_token",
  },
};
