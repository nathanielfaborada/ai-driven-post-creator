import "dotenv/config";

export const config = {
  astaPlays: {
    apiKey: process.env.OPENAI_API_KEY_ASTA_PLAYS,
    pageId: process.env.FB_PAGE_ID_ASTA_PLAYS,
    pageToken: process.env.FB_PAGE_ACCESS_TOKEN_ASTA_PLAYS,
  },
  nanoFacts: {
    apiKey: process.env.OPENAI_API_KEY_NANO_FACTS,
    pageId: process.env.FB_PAGE_ID_NANO_FACTS,
    pageToken: process.env.FB_PAGE_ACCESS_TOKEN_NANO_FACTS,
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    queueChannelId: process.env.TELEGRAM_CHANNEL_QUEUE_ID,
    archiveChannelId: process.env.TELEGRAM_CHANNEL_ARCHIVE_ID,
  },
  server: {
    port: Number(process.env.PORT) || 8080,
  },
  facebook: {
    verifyToken: process.env.FB_VERIFY_TOKEN || "my_facebook_webhook_secret_token",
  },
};

