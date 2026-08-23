import express from "express";
import { config } from "./config/env.js";
import { sendSenderAction, sendMessengerReply, getUserProfile } from "./services/messenger.service.js";
import { generateMessengerChatReply } from "./services/ai.service.js";

const app = express();
app.use(express.json());

// In-memory cache to prevent duplicate processing of the same message ID
const processedMessageIds = new Set();

function isMessageProcessed(mid) {
  if (!mid) return false;
  if (processedMessageIds.has(mid)) return true;
  processedMessageIds.add(mid);

  // Keep set size bounded
  if (processedMessageIds.size > 2000) {
    const oldestKey = processedMessageIds.values().next().value;
    processedMessageIds.delete(oldestKey);
  }
  return false;
}

/**
 * Health check & status endpoint.
 */
app.get("/", (req, res) => {
  res.status(200).json({
    status: "online",
    service: "AI-Driven Facebook & Telegram Automation",
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /webhook
 * Verification endpoint for Meta Webhook setup (Hub Challenge Handshake).
 */
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  const expectedToken = config.facebook.verifyToken;

  if (mode === "subscribe" && token === expectedToken) {
    console.log("[Webhook] ✅ Successfully verified webhook handshake with Meta!");
    return res.status(200).send(challenge);
  } else {
    console.warn("[Webhook] ❌ Webhook verification failed. Token mismatch or invalid mode.");
    return res.sendStatus(403);
  }
});

/**
 * POST /webhook
 * Receives real-time events from Meta (Messages, Postbacks, etc.).
 */
app.post("/webhook", (req, res) => {
  const body = req.body;

  if (body.object !== "page") {
    return res.sendStatus(404);
  }

  // Acknowledge Meta immediately (must respond within 5 seconds)
  res.status(200).send("EVENT_RECEIVED");

  const entries = body.entry || [];
  for (const entry of entries) {
    const messagingEvents = entry.messaging || [];
    for (const event of messagingEvents) {
      handleMessagingEvent(event).catch((err) => {
        console.error("[Webhook] Error handling messaging event:", err.message);
      });
    }
  }
});

/**
 * Process incoming 1-on-1 Messenger chat events.
 * @param {Object} event - Meta messaging webhook event
 */
async function handleMessagingEvent(event) {
  const senderPsid = event.sender?.id;
  const recipientPageId = event.recipient?.id;
  const message = event.message;

  // 1. Skip if no message or if it is an echo (sent by the page itself)
  if (!message || message.is_echo) {
    return;
  }

  // 2. Skip duplicate deliveries
  if (isMessageProcessed(message.mid)) {
    return;
  }

  // 3. Extract text message
  const userText = message.text?.trim();
  if (!userText) {
    console.log(`[Messenger] Received non-text message/attachment from PSID ${senderPsid}. Skipping.`);
    return;
  }

  // 4. Match recipient Page ID to configure correct Page persona & token
  let pageKey = null;
  let pageTitle = null;
  let pageConfig = null;

  if (recipientPageId === config.astaPlays.pageId) {
    pageKey = "astaPlays";
    pageTitle = "Asta Plays";
    pageConfig = config.astaPlays;
  } else if (recipientPageId === config.nanoFacts.pageId) {
    pageKey = "nanoFacts";
    pageTitle = "Nano Facts";
    pageConfig = config.nanoFacts;
  } else {
    console.warn(`[Messenger] Received message for untracked Page ID: ${recipientPageId}`);
    return;
  }

  if (!pageConfig?.pageToken) {
    console.warn(`[Messenger] Missing Page Token for ${pageTitle}. Cannot send reply.`);
    return;
  }

  console.log(`\n[Messenger] 📩 New message on ${pageTitle} from PSID ${senderPsid}: "${userText}"`);

  // 5. Send "typing..." indicator to Messenger
  await sendSenderAction({
    recipientPsid: senderPsid,
    action: "typing_on",
    pageToken: pageConfig.pageToken,
  });

  // 6. Fetch user's first name if permitted
  const profile = await getUserProfile({
    userPsid: senderPsid,
    pageToken: pageConfig.pageToken,
  });
  const userName = profile?.first_name || null;

  // 7. Generate contextual AI reply
  const aiReply = await generateMessengerChatReply({
    userMessage: userText,
    page: pageKey,
    userName,
  });

  if (!aiReply) {
    console.log(`[Messenger] No AI reply generated for ${pageTitle}.`);
    return;
  }

  console.log(`[Messenger] 🤖 AI Response for ${pageTitle}:\n"${aiReply}"`);

  // 8. Natural pause of 1.5s for realistic conversation pacing
  await new Promise((resolve) => setTimeout(resolve, 1500));

  // 9. Send the reply via Messenger Send API
  await sendMessengerReply({
    recipientPsid: senderPsid,
    messageText: aiReply,
    pageToken: pageConfig.pageToken,
  });
}

/**
 * Start the Express Webhook server.
 */
export function startServer() {
  const port = config.server.port;
  app.listen(port, () => {
    console.log(`🌐 Webhook Server is running on port ${port} (Ready for Meta Webhook requests)`);
  });
}
