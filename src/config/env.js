import "dotenv/config";

/**
 * Dynamically extract all Gemini API keys from environment variables.
 * Discovers GEMINI_PROJECT_1, GEMINI_PROJECT_2, ..., and any GEMINI_API_KEY variants.
 * @returns {string[]} List of valid API keys
 */
function getGeminiApiKeys() {
  const keys = [];

  // 1. Collect sequential GEMINI_PROJECT_1..50
  for (let i = 1; i <= 50; i++) {
    const key = process.env[`GEMINI_PROJECT_${i}`];
    if (key && key.trim()) {
      keys.push(key.trim());
    }
  }

  // 2. Collect any other GEMINI_PROJECT_* or GEMINI_API_KEY_* definitions
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

  // 3. Fallback for legacy single key if present
  if (process.env.GEMINI_API_KEY && !keys.includes(process.env.GEMINI_API_KEY.trim())) {
    keys.push(process.env.GEMINI_API_KEY.trim());
  }

  return keys;
}

export const config = {
  gemini: {
    apiKeys: getGeminiApiKeys(),
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
    archiveBiologyChannelId: process.env.TELEGRAM_CHANNEL_ARCHIVE_BIOLOGY_ID,
    archivePeriodicChannelId: process.env.TELEGRAM_CHANNEL_ARCHIVE_PERIODIC_ID,
  },
  server: {
    port: Number(process.env.PORT) || 8080,
  },
  facebook: {
    verifyToken: process.env.FB_VERIFY_TOKEN || "my_facebook_webhook_secret_token",
  },
};


