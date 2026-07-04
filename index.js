import "dotenv/config";
import axios from "axios";
import { GoogleGenAI } from "@google/genai";
import schedule from "node-schedule";

const aiAstaplays = new GoogleGenAI({ apiKey: process.env.OPENAI_API_KEY_ASTA_PLAYS });

const aiNanoFacts = new GoogleGenAI({ apiKey: process.env.OPENAI_API_KEY_NANO_FACTS });

// Facebook Page ID and Access Token from environment variables for Asta Plays
const FB_PAGE_ID_ASTA_PLAYS = process.env.FB_PAGE_ID_ASTA_PLAYS;
const FB_PAGE_ACCESS_TOKEN_ASTA_PLAYS = process.env.FB_PAGE_ACCESS_TOKEN_ASTA_PLAYS;

// Facebook Page ID and Access Token from environment variables for Nano Facts
const FB_PAGE_ID_NANO_FACTS = process.env.FB_PAGE_ID_NANO_FACTS;
const FB_PAGE_ACCESS_TOKEN_NANO_FACTS = process.env.FB_PAGE_ACCESS_TOKEN_NANO_FACTS;

async function generateCaption_AstaPlays() {
  try {
    const response = await aiAstaplays.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `
      Generate a short, SEO-optimized Mobile Legends hero output in this exact structure:
 
      HERO: {hero name only, no extra text}
      CAPTION: **Who is {hero name}?** {Short description of that hero}
 
      Requirements:
      - Random Mobile Legends hero name
      - Description must be 1–5 sentences only
      - Description must be motivational/inspirational
      - Naturally include searchable keywords like the hero's name, "Mobile Legends", "MLBB", and the hero's role (e.g. Tank, Assassin, Mage, Marksman, Support, Fighter) so the post ranks well in search and Facebook's algorithm
      - Use emojis
      - End with exactly 5 relevant, high-traffic hashtags related to Mobile Legends, MLBB, and the specific hero/role (e.g. #MobileLegends #MLBB #MLBBPh plus hero/role-specific tags)
      `,
    });

    const text = response.text.trim();

    const heroMatch = text.match(/HERO:\s*(.+)/i);
    const captionMatch = text.match(/CAPTION:\s*([\s\S]+)/i);

    const heroName = heroMatch ? heroMatch[1].trim() : null;
    const caption = captionMatch ? captionMatch[1].trim() : text;

    return { heroName, caption };
  } catch (err) {
    console.error("Error generating Asta Plays caption:", err.message);
    return { heroName: null, caption: null };
  }
}

async function generateCaption_NanoFacts() {
  try {
    const response = await aiNanoFacts.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `
      Generate a short, SEO-optimized Chemical element chart output in this exact structure:
 
      ELEMENT: {element name only, no extra text}
      CAPTION: **What is {element name}?** {Short description of that element}
 
      Requirements:
      - Random Chemical element name
      - Description must be 1–5 sentences only
      - Description must be motivational/inspirational
      - Naturally include searchable keywords like the element's name, its chemical symbol, "periodic table", and "chemistry" so the post ranks well in search and Facebook's algorithm
      - Use emojis
      - End with exactly 5 relevant, high-traffic hashtags related to Chemistry, Science, the periodic table, 
        and the specific element (e.g. #Chemistry #Science #PeriodicTable plus element-specific tags)
      `,
    });

    const text = response.text.trim();

    const elementMatch = text.match(/ELEMENT:\s*(.+)/i);
    const captionMatch = text.match(/CAPTION:\s*([\s\S]+)/i);

    const elementName = elementMatch ? elementMatch[1].trim() : null;
    const caption = captionMatch ? captionMatch[1].trim() : text;

    return { elementName, caption };
  } catch (err) {
    console.error("Error generating Nano Facts caption:", err.message);
    return { elementName: null, caption: null };
  }
}

async function getHeroImage(heroName) {
  try {
    const encodedName = encodeURIComponent(heroName);
    const res = await axios.get(`https://openmlbb.fastapicloud.dev/api/heroes/${encodedName}`);
    const headBig = res.data?.data?.records?.[0]?.data?.head_big;
    return headBig || null;
  } catch (err) {
    console.error("Could not fetch hero image:", err.message);
    return null;
  }
}

async function postToFacebook(caption, imageUrl, pageId, pageToken) {
  if (!caption) {
    console.log("No caption generated, skipping post.");
    return;
  }
  if (!pageId || !pageToken) {
    console.error("Missing pageId or pageToken, skipping post.");
    return;
  }

  try {
    if (imageUrl) {
      // Post with image using Photos API
      const url = `https://graph.facebook.com/v24.0/${pageId}/photos`;
      const res = await axios.post(url, {
        url: imageUrl,
        message: caption,
        access_token: pageToken,
      });
      console.log("Posted with image! Post ID:", res.data.id);
    } else {
      // Fallback: post text only if no image found
      const url = `https://graph.facebook.com/v24.0/${pageId}/feed`;
      const res = await axios.post(url, {
        message: caption,
        access_token: pageToken,
      });
      console.log("Posted (text only)! Post ID:", res.data.id);
    }
  } catch (err) {
    console.error("Error posting to Facebook:", err.response?.data || err.message);
  }
}

async function runAsta() {
  console.log("[Asta Plays] Generating caption...");
  const { heroName, caption } = await generateCaption_AstaPlays();

  if (!caption) {
    console.log("[Asta Plays] No caption generated, aborting this run.");
    return;
  }

  console.log("[Asta Plays] Hero:", heroName);
  console.log("[Asta Plays] Caption:\n", caption);

  let imageUrl = null;
  if (heroName) {
    console.log("[Asta Plays] Fetching hero image...");
    imageUrl = await getHeroImage(heroName);
    console.log("[Asta Plays] Image URL:", imageUrl ?? "Not found, will post text only");
  }

  console.log("[Asta Plays] Posting to Facebook...");
  await postToFacebook(caption, imageUrl, FB_PAGE_ID_ASTA_PLAYS, FB_PAGE_ACCESS_TOKEN_ASTA_PLAYS);
}

async function runNano() {
  console.log("[Nano Facts] Generating caption...");
  const { elementName, caption } = await generateCaption_NanoFacts();

  if (!caption) {
    console.log("[Nano Facts] No caption generated, aborting this run.");
    return;
  }

  console.log("[Nano Facts] Element:", elementName);
  console.log("[Nano Facts] Caption:\n", caption);

  // No image source for chemical elements yet, so we post text only.
  const imageUrl = null;

  console.log("[Nano Facts] Posting to Facebook...");
  await postToFacebook(caption, imageUrl, FB_PAGE_ID_NANO_FACTS, FB_PAGE_ACCESS_TOKEN_NANO_FACTS);
}

// Run once immediately on startup
runAsta();
runNano();

// Schedule recurring runs at 6 AM and 6 PM daily
schedule.scheduleJob('0 6,18 * * *', () => {
  console.log("Scheduled job triggered at", new Date().toLocaleString());
  runAsta();
});

schedule.scheduleJob('0 */2 * * *', () => {
  console.log("Scheduled job triggered at", new Date().toLocaleString());
  runNano();
});