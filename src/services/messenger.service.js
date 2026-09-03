import axios from "axios";

const GRAPH_API_VERSION = "v26.0";
const BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

// Show a typing bubble or seen indicator in Messenger
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
    // Ignore if sender action fails, it is not critical
    return false;
  }
}

// Send a direct message reply in Facebook Messenger
export async function sendMessengerReply({ recipientPsid, messageText, pageToken }) {
  if (!recipientPsid || !messageText || !pageToken) {
    console.error("[Messenger] [ERROR] Missing recipientPsid, messageText, or pageToken.");
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

    console.log(`[Messenger] [SUCCESS] Sent message to PSID ${recipientPsid}. Msg ID:`, res.data?.message_id);
    return res.data?.message_id || null;
  } catch (err) {
    const errorDetails = err.response?.data || err.message;
    console.error("[Messenger] [ERROR] Error sending Messenger reply:", errorDetails);
    return null;
  }
}

// Grab the user's name so the AI can greet them politely
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
