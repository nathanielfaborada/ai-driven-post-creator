import { GoogleGenAI } from "@google/genai";
import { config } from "../config/env.js";

const aiAstaplays = new GoogleGenAI({ apiKey: config.astaPlays.apiKey });
const aiNanoFacts = new GoogleGenAI({ apiKey: config.nanoFacts.apiKey });

const GEMINI_MODEL = "gemini-3.6-flash";

/**
 * Generate MLBB Facebook Post Caption for Asta Plays.
 * @returns {Promise<{ heroName: string|null, caption: string|null }>}
 */
export async function generateCaptionAstaPlays() {
  try {
    const response = await aiAstaplays.models.generateContent({
      model: GEMINI_MODEL,
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

/**
 * Generate Chemistry Facebook Post Caption for Nano Facts.
 * @returns {Promise<{ elementName: string|null, caption: string|null }>}
 */
export async function generateCaptionNanoFacts() {
  try {
    const response = await aiNanoFacts.models.generateContent({
      model: GEMINI_MODEL,
      contents: `
      Generate a short, SEO-optimized, text-only Facebook post about a random chemical element using this EXACT structure.

      ELEMENT: {element name only}

      TITLE:
      {Element Name} – {Short catchy subtitle, 4–8 words}

      CAPTION:

      Did you know {one surprising fact or engaging question about the element}? {1 relevant emoji}

      {Write ONLY 2 short sentences (under 200 characters total) explaining what the element is, why it's important, or where it's used. Make it exciting, educational, and easy for anyone to understand. Include 1–2 relevant emojis. Avoid long paragraphs.}

      ⚛️ Learn Science in Seconds
      New Periodic Table facts every week!

      👍 Like, Share & Follow Nano Facts for more science content.

      {10–15 comma-separated SEO keywords including the element name, chemical symbol, element category, periodic table, chemistry, science, STEM, science facts, education, and common uses}

      Exactly 5 hashtags:
      #Chemistry #Science #PeriodicTable #{ElementName} #ScienceFacts

      Rules:
      - Return plain text only.
      - Do NOT include URLs or external links.
      - Do NOT include donation requests or PayPal links.
      - Keep the caption under 350 characters for better Facebook reach.
      - Make the first sentence a strong hook.
      - Use simple English suitable for all ages.
      - Facts must be scientifically accurate.
      - Use only 2–3 emojis total.
      - Follow the exact formatting and line breaks shown above.
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

/**
 * Generate an AI response to a user's Facebook comment.
 * @param {Object} params
 * @param {string} params.userComment
 * @param {string} [params.postTopic]
 * @param {"astaPlays"|"nanoFacts"} [params.page]
 * @returns {Promise<string|null>}
 */
export async function generateCommentReply({ userComment, postTopic = "our Facebook page", page = "astaPlays", userName = null }) {
  try {
    const aiInstance = page === "nanoFacts" ? aiNanoFacts : aiAstaplays;
    const persona = page === "nanoFacts"
      ? "Admin of Nano Facts (a page about science and chemistry facts)"
      : "Admin of Asta Plays (a gaming page focused on Mobile Legends: Bang Bang)";

    const response = await aiInstance.models.generateContent({
      model: GEMINI_MODEL,
      contents: `
      You are the friendly, helpful, and engaging Facebook page ${persona}.
      ${userName ? `The commenter's name is "${userName}".` : ""}
      A user commented: "${userComment}"
      The post topic is: "${postTopic}".

      Instructions:
      - Reply in natural, casual, and friendly English ONLY (do not use Tagalog or Taglish).
      - Keep it short, engaging, and conversational (1-2 sentences).
      ${userName ? `- If natural, greet them briefly by their first name (e.g., "Thanks, John!" or "Hey Sarah,").` : ""}
      - Include 1 relevant emoji.
      - Do not include external links or spam.
      - Return plain text only.
      `,
    });

    return response.text.trim();
  } catch (err) {
    console.error("Error generating comment reply:", err.message);
    return null;
  }
}
