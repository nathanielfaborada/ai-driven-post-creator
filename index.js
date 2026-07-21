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
      Generate a short, SEO-optimized, text-only Facebook post about a random Mobile Legends: Bang Bang hero using the EXACT structure below.

      HERO: {hero name only}

      TITLE:
      {Hero Name} – {Short catchy subtitle, 4–8 words}

      CAPTION:

      Did you know {one surprising fact or engaging question about the hero}? 🎮

      {Write ONLY 2 short sentences (under 200 characters total) describing the hero's role, signature abilities, strengths, or best playstyle. Keep it exciting, motivational, and beginner-friendly. Use only 1–2 relevant emojis.}

      🎮 Level Up Your Game
      New Mobile Legends hero spotlights every week!

      👍 Like, Share & Follow for more MLBB guides and hero spotlights.

      KEYWORDS:
      {10–15 comma-separated SEO keywords including hero name, role, Mobile Legends, MLBB, gameplay, build guide, hero guide, ranked, esports, MOBA, strategy}

      HASHTAGS:
      Exactly 5 hashtags:
      #MobileLegends #MLBB #MLBBPH #{HeroName} #{HeroRole}

      Rules:
      - Return plain text only.
      - Do NOT include URLs, links, Discord servers, or donation requests.
      - Keep the entire caption under 350 characters for better Facebook reach.
      - The first sentence must be a strong hook starting with "Did you know".
      - Use simple English that anyone can understand.
      - Information must be accurate based on the latest Mobile Legends hero lore and gameplay.
      - Use only 2–3 emojis total.
      - Do not mention skins unless they are relevant to the hero's identity.
      - Follow the exact formatting and line breaks shown above.
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
Generate a short, SEO-optimized, text-only Facebook post about a random chemical element using the EXACT structure below.

ELEMENT: {element name only}

TITLE:
{Element Name} – {Short catchy subtitle, 4–8 words}

CAPTION:

Did you know {one surprising fact about the element}? 🧪

{Write ONLY 2 short sentences (under 200 characters total) explaining what the element is, why it's important, or where it's used. Make it exciting and easy to understand.}

⚛️ Learn Science in Seconds
New Periodic Table facts every week!

👍 Like, Share & Follow Nano Facts for more science content.

KEYWORDS:
{10-15 comma-separated SEO keywords}

HASHTAGS:
Exactly 5 hashtags:
#Chemistry #Science #PeriodicTable #{ElementName} #ScienceFacts
      `,
    });

    const text = response.text.trim();

    const elementName =
      text.match(/ELEMENT:\s*(.+)/i)?.[1]?.trim() || null;

    const title =
      text.match(/TITLE:\s*([\s\S]*?)CAPTION:/i)?.[1]?.trim() || "";

    const caption =
      text.match(/CAPTION:\s*([\s\S]*)/i)?.[1]?.trim() || "";

    const finalCaption =
      toUnicodeBold(title) + "\n\n" + caption;

    return {
      elementName,
      caption: finalCaption,
    };
  } catch (err) {
    console.error(err);
    return {
      elementName: null,
      caption: null,
    };
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

  const formattedCaption = toUnicodeBold(caption);

  let imageUrl = null;
  if (heroName) {
    console.log("[Asta Plays] Fetching hero image...");
    imageUrl = await getHeroImage(heroName);
    console.log("[Asta Plays] Image URL:", imageUrl ?? "Not found, will post text only");
  }

  console.log("[Asta Plays] Posting to Facebook...");
  await postToFacebook(formattedCaption, imageUrl, FB_PAGE_ID_ASTA_PLAYS, FB_PAGE_ACCESS_TOKEN_ASTA_PLAYS);
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
  const formattedCaption = toUnicodeBold(caption);
  await postToFacebook(formattedCaption, imageUrl, FB_PAGE_ID_NANO_FACTS, FB_PAGE_ACCESS_TOKEN_NANO_FACTS);
}

// Run once immediately on startup
runAsta();
runNano();


schedule.scheduleJob('0 10,19 * * *', () => {
  console.log("Asta scheduled:", new Date().toLocaleString());
  runAsta();
});

schedule.scheduleJob('0 6,10,14,18,21 * * *', () => {
  console.log("Nano scheduled:", new Date().toLocaleString());
  runNano();
});