import axios from "axios";

const GRAPH_API_VERSION = "v26.0";
const BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/**
 * Send a sender action to a user (e.g. typing_on, typing_off, mark_seen).
 * @param {Object} params
 * @param {string} params.recipientPsid - Page-scoped user ID
 * @param {"typing_on"|"typing_off"|"mark_seen"} [params.action]
 * @param {string} params.pageToken - Page Access Token
 * @returns {Promise<boolean>}
 */
export async function sendSenderAction({ recipientPsid, action = "typing_on", pageToken }) {
  if (!recipientPsid || !pageToken) return false;

  try {
    const url = `${BASE_URL}/me/messages`;
    await axios.post(url, {
      recipient: { id: recipientPsid },
      sender_action: action,
      access_token: pageToken,
    });
    return true;
  } catch (err) {
    // Non-critical, just ignore if sender action fails
    return false;
  }
}

/**
 * Send a direct text message reply via Facebook Messenger Send API.
 * @param {Object} params
 * @param {string} params.recipientPsid - Page-scoped user ID of the recipient
 * @param {string} params.messageText - Text message content to send
 * @param {string} params.pageToken - Facebook Page Access Token
 * @returns {Promise<string|null>} Message ID if successful, null if failed
 */
export async function sendMessengerReply({ recipientPsid, messageText, pageToken }) {
  if (!recipientPsid || !messageText || !pageToken) {
    console.error("[Messenger] Missing recipientPsid, messageText, or pageToken.");
    return null;
  }

  try {
    const url = `${BASE_URL}/me/messages`;
    const res = await axios.post(url, {
      recipient: { id: recipientPsid },
      messaging_type: "RESPONSE",
      message: { text: messageText },
      access_token: pageToken,
    });

    console.log(`[Messenger] ✅ Sent message to PSID ${recipientPsid}! Msg ID:`, res.data?.message_id);
    return res.data?.message_id || null;
  } catch (err) {
    const errorDetails = err.response?.data || err.message;
    console.error("[Messenger] ❌ Error sending Messenger reply:", errorDetails);
    return null;
  }
}

/**
 * Optionally fetch user's basic profile details (e.g. first_name).
 * @param {Object} params
 * @param {string} params.userPsid
 * @param {string} params.pageToken
 * @returns {Promise<{ first_name?: string, last_name?: string, name?: string }|null>}
 */
export async function getUserProfile({ userPsid, pageToken }) {
  if (!userPsid || !pageToken) return null;

  try {
    const url = `${BASE_URL}/${userPsid}`;
    const res = await axios.get(url, {
      params: {
        fields: "first_name,last_name,name",
        access_token: pageToken,
      },
    });
    return res.data;
  } catch {
    return null;
  }
}
