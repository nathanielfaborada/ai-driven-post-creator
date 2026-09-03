import { GoogleGenAI } from "@google/genai";
import { config } from "../config/env.js";
import { stringToUnicodeBold, toUnicodeBold } from "../utils/formatters.js";

export const SCIENCE_CATEGORIES = [
  "Human Biology & Anatomy",
  "Chemistry & Periodic Table",
  "Astronomy & Deep Space",
  "Quantum & Modern Physics",
  "AI, Robotics & Future Technology",
  "Deep Sea & Ocean Mysteries",
  "Earth Sciences & Extreme Nature",
  "Materials Science & Nanotechnology",
  "Paleontology & Prehistoric Life",
  "Rocket Science & Space Missions",
];

const GEMINI_MODELS = [
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-flash-lite-latest",
];

// Track which Gemini API key is currently active
let currentKeyIndex = 0;
const apiKeys = config.gemini?.apiKeys || [];

if (apiKeys.length === 0) {
  console.warn("[AI Service] [WARN] No Gemini API keys found in configuration.");
} else {
  console.log(`[AI Service] [INFO] Initialized Gemini Pool with ${apiKeys.length} API key(s) (Round-Robin, Model Fallback & Auto-Failover Enabled).`);
}

// Helper to see how many API keys we have and which one is active
export function getKeyPoolStatus() {
  return {
    totalKeys: apiKeys.length,
    currentIndex: currentKeyIndex,
    currentKeyLabel: apiKeys.length > 0 ? `Key #${currentKeyIndex + 1}` : "None",
    availableModels: GEMINI_MODELS,
  };
}

// Call Gemini AI while rotating through our API keys and models if one gets busy or rate-limited
async function executeGeminiWithRotation({ contents, taskName = "AI Task" }) {
  if (apiKeys.length === 0) {
    throw new Error("No Gemini API keys configured. Please check your .env file.");
  }

  let modelIdx = 0;
  let lastError = null;

  while (modelIdx < GEMINI_MODELS.length) {
    const currentModel = GEMINI_MODELS[modelIdx];

    for (let keyAttempt = 0; keyAttempt < apiKeys.length; keyAttempt++) {
      const keyIndex = (currentKeyIndex + keyAttempt) % apiKeys.length;
      const apiKey = apiKeys[keyIndex];
      const keyLabel = `Key #${keyIndex + 1}/${apiKeys.length}`;

      try {
        const aiClient = new GoogleGenAI({ apiKey });
        const response = await aiClient.models.generateContent({
          model: currentModel,
          contents,
        });

        currentKeyIndex = (keyIndex + 1) % apiKeys.length;
        console.log(`[AI Service] [SUCCESS] [${taskName}] Completed using model [${currentModel}] on Gemini ${keyLabel}`);
        return response.text?.trim() || "";
      } catch (err) {
        lastError = err;
        const isServerDemandError =
          err.message?.includes("503") ||
          err.message?.includes("UNAVAILABLE") ||
          err.message?.includes("high demand") ||
          err.message?.includes("404") ||
          err.message?.includes("NOT_FOUND");

        if (isServerDemandError) {
          console.warn(`[AI Service] [WARN] [${taskName}] Model [${currentModel}] 503 high demand / unavailable. Fast-failing over to next fallback model.`);
          break;
        } else {
          console.warn(`[AI Service] [WARN] [${taskName}] Key issue on Gemini ${keyLabel} (${err.message}). Retrying next key.`);
        }
      }
    }

    modelIdx++;
  }

  throw new Error(`All Gemini models and keys exhausted. Last error: ${lastError?.message}`);
}

// Ask Gemini AI to write a short Mobile Legends post for Asta Plays
export async function generateCaptionAstaPlays() {
  try {
    const text = await executeGeminiWithRotation({
      taskName: "Asta Plays Caption",
      contents: `
      Generate a short, SEO-optimized, text-only Facebook post about a random Mobile Legends: Bang Bang hero using the EXACT structure below.

      HERO: {hero name only}

      TITLE:
      {Hero Name} - {Short catchy subtitle, 4-8 words}

      CAPTION:

      Did you know {one surprising fact or engaging question about the hero}?

      {Write ONLY 2 short sentences (under 200 characters total) describing the hero's role, signature abilities, strengths, or best playstyle. Keep it exciting, motivational, and beginner-friendly.}

      Level Up Your Game
      New Mobile Legends hero spotlights every week.

      Like, Share and Follow for more MLBB guides and hero spotlights.

      {10-15 comma-separated SEO keywords including hero name, role, Mobile Legends, MLBB, gameplay, build guide, hero guide, ranked, esports, MOBA, strategy}

      Exactly 5 hashtags:
      #MobileLegends #MLBB #MLBBPH #{HeroName} #{HeroRole}

      Rules:
      - Return plain text only.
      - Do NOT use emojis. Keep text clean and readable.
      - Do NOT include external URLs, links, Discord servers, or donation requests.
      - Keep the entire caption concise and under 350 characters for strong reach.
      - The first sentence must be a strong hook starting with "Did you know".
      - Use simple, accessible English.
      - Information must be accurate based on the latest Mobile Legends hero lore and gameplay.
      - Follow the exact formatting and line breaks shown above.
      `,
    });

    const heroMatch = text.match(/(?:\*\*|##\s*)?HERO:?\*?\*?\s*(.+)/i);
    const titleMatch = text.match(/(?:\*\*|##\s*)?TITLE:?\*?\*?\s*([\s\S]+?)(?=\n\s*(?:\*\*|##\s*)?CAPTION:|$)/i);
    const captionMatch = text.match(/(?:\*\*|##\s*)?CAPTION:?\*?\*?\s*([\s\S]+)/i);

    const heroName = heroMatch ? heroMatch[1].replace(/[*#_]/g, "").trim() : null;
    const rawTitle = titleMatch ? titleMatch[1].replace(/[*#_]/g, "").trim() : null;
    const rawBody = captionMatch ? captionMatch[1].trim() : text;

    const boldTitle = rawTitle ? stringToUnicodeBold(rawTitle) : "";
    const boldBody = toUnicodeBold(rawBody);
    const caption = boldTitle ? `${boldTitle}\n\n${boldBody}` : boldBody;

    return { heroName, caption };
  } catch (err) {
    console.error("[AI Service] [ERROR] Error generating Asta Plays caption:", err.message);
    return { heroName: null, caption: null };
  }
}

// Ask Gemini AI to write an educational science post for Nano Facts
export async function generateCaptionNanoFacts() {
  try {
    const text = await executeGeminiWithRotation({
      taskName: "Nano Facts Caption",
      contents: `
      Generate a short, SEO-optimized Facebook post about a fascinating topic in SCIENCE & TECHNOLOGY.
      Pick randomly from diverse fields such as:
      - Astronomy, Astrophysics, Deep Space, Exoplanets, Black Holes
      - Quantum Physics, Particle Physics, Lasers, Optics, Relativity
      - Biology, Genetics, Neuroscience, Evolution, Microbiology
      - Nanotechnology, Materials Science, Superconductors, Graphene
      - Artificial Intelligence, Robotics, Quantum Computing, Future Tech
      - Earth Sciences, Oceanography, Geology, Planetary Science
      - Chemistry, Amazing Elements, Breakthrough Molecules

      Use this EXACT structure:

      TOPIC: {topic name only}

      TITLE:
      {Topic Name} - {Short catchy subtitle, 4-8 words}

      CAPTION:

      Did you know {one mind-blowing fact or engaging hook question about the topic}?

      {Write ONLY 2 short, fascinating sentences explaining how it works, why it matters, or its futuristic impact. Make it educational, exciting, and accessible to anyone.}

      Unlock The Nano Facts Science Library
      Love learning? Help us unlock exclusive Science E-Books, Physics & Chemistry Study Guides, Biology materials, and downloadable PDF resources.

      Support our page & become a Subscriber:
      https://www.facebook.com/nanoscie/subscribe/

      Comment below: What science topic should be included in our next exclusive study guide?

      {10-15 comma-separated SEO keywords directly related to this topic, field of science, technology, research, discovery, education, STEM}

      Exactly 5 hashtags matching the topic:
      #Science #Technology #NanoFacts #STEM #{TopicOrField}

      Rules:
      - The first sentence must be a strong hook starting with "Did you know".
      - Do NOT use emojis. Clean and readable plain text only.
      - Facts must be scientifically accurate and up-to-date.
      - Keep sentences punchy and engaging.
      - Follow the exact formatting and line breaks shown above.
      `,
    });

    const topicMatch = text.match(/(?:\*\*|##\s*)?(?:TOPIC|ELEMENT):?\*?\*?\s*(.+)/i);
    const titleMatch = text.match(/(?:\*\*|##\s*)?TITLE:?\*?\*?\s*([\s\S]+?)(?=\n\s*(?:\*\*|##\s*)?CAPTION:|$)/i);
    const captionMatch = text.match(/(?:\*\*|##\s*)?CAPTION:?\*?\*?\s*([\s\S]+)/i);

    const topicName = topicMatch ? topicMatch[1].replace(/[*#_]/g, "").trim() : null;
    const rawTitle = titleMatch ? titleMatch[1].replace(/[*#_]/g, "").trim() : null;
    const rawBody = captionMatch ? captionMatch[1].trim() : text;

    const boldTitle = rawTitle ? stringToUnicodeBold(rawTitle) : "";
    const boldBody = toUnicodeBold(rawBody);
    const caption = boldTitle ? `${boldTitle}\n\n${boldBody}` : boldBody;

    return { topicName, elementName: topicName, caption };
  } catch (err) {
    console.error("[AI Service] [ERROR] Error generating Nano Facts caption:", err.message);
    return { topicName: null, elementName: null, caption: null };
  }
}

// Figure out which of our 10 science categories a topic belongs to
export async function classifyReelCategory(text = "") {
  if (!text || !text.trim()) {
    return "Human Biology & Anatomy";
  }

  const lower = text.toLowerCase();

  // Fast keyword matching
  if (lower.includes("dna") || lower.includes("cell") || lower.includes("brain") || lower.includes("neuron") || lower.includes("body") || lower.includes("heart") || lower.includes("blood") || lower.includes("immune") || lower.includes("bacteria") || lower.includes("organ") || lower.includes("virus")) {
    return "Human Biology & Anatomy";
  }
  if (lower.includes("periodic") || lower.includes("chemical") || lower.includes("chemistry") || lower.includes("element") || lower.includes("atom") || lower.includes("molecule") || lower.includes("acid") || lower.includes("reaction") || lower.includes("compound")) {
    return "Chemistry & Periodic Table";
  }
  if (lower.includes("black hole") || lower.includes("galaxy") || lower.includes("space") || lower.includes("star") || lower.includes("telescope") || lower.includes("planet") || lower.includes("exoplanet") || lower.includes("supernova") || lower.includes("nebula") || lower.includes("astronomy")) {
    return "Astronomy & Deep Space";
  }
  if (lower.includes("quantum") || lower.includes("laser") || lower.includes("physics") || lower.includes("relativity") || lower.includes("particle") || lower.includes("optics") || lower.includes("accelerator")) {
    return "Quantum & Modern Physics";
  }
  if (lower.includes("robot") || lower.includes("ai") || lower.includes("intelligence") || lower.includes("cyber") || lower.includes("tech") || lower.includes("algorithm") || lower.includes("future")) {
    return "AI, Robotics & Future Technology";
  }
  if (lower.includes("ocean") || lower.includes("sea") || lower.includes("trench") || lower.includes("mariana") || lower.includes("shark") || lower.includes("whale") || lower.includes("squid") || lower.includes("bioluminescen") || lower.includes("abyss") || lower.includes("underwater")) {
    return "Deep Sea & Ocean Mysteries";
  }
  if (lower.includes("volcano") || lower.includes("earthquake") || lower.includes("storm") || lower.includes("tornado") || lower.includes("lightning") || lower.includes("earth") || lower.includes("geology") || lower.includes("nature") || lower.includes("crystal")) {
    return "Earth Sciences & Extreme Nature";
  }
  if (lower.includes("graphene") || lower.includes("aerogel") || lower.includes("nanotech") || lower.includes("material") || lower.includes("superconductor") || lower.includes("polymer") || lower.includes("carbon nanotube")) {
    return "Materials Science & Nanotechnology";
  }
  if (lower.includes("dinosaur") || lower.includes("fossil") || lower.includes("prehistoric") || lower.includes("megalodon") || lower.includes("mammoth") || lower.includes("paleontology") || lower.includes("extinction")) {
    return "Paleontology & Prehistoric Life";
  }
  if (lower.includes("rocket") || lower.includes("mars") || lower.includes("nasa") || lower.includes("spacex") || lower.includes("starship") || lower.includes("rover") || lower.includes("satellite") || lower.includes("launch") || lower.includes("orbit")) {
    return "Rocket Science & Space Missions";
  }

  // Ask AI to pick a category if keyword matching was not sure
  try {
    const rawCategory = await executeGeminiWithRotation({
      taskName: "Reel Category Classification",
      contents: `
      Classify the following science topic into EXACTLY ONE of these 10 categories:
      ${SCIENCE_CATEGORIES.map((c) => `- "${c}"`).join("\n")}

      Topic: "${text}"

      Respond with ONLY the exact category name from the list.
      `,
    });

    const matched = SCIENCE_CATEGORIES.find((cat) => rawCategory.toLowerCase().includes(cat.toLowerCase()));
    return matched || "Human Biology & Anatomy";
  } catch {
    return "Human Biology & Anatomy";
  }
}

// Create an engaging video caption and pick the right science category for a new reel
export async function generateReelCaptionNanoFacts(initialTopic = "") {
  try {
    const topicPrompt = initialTopic?.trim()
      ? `The creator provided this topic/context for the video reel: "${initialTopic.trim()}". Generate an engaging, high-retention Facebook Reel caption based specifically on this video topic.`
      : `Generate a short, SEO-optimized Facebook Reel caption about a fascinating topic in SCIENCE & TECHNOLOGY. Pick randomly from diverse fields (Astronomy, Quantum Physics, Biology, Nanotechnology, AI, Chemistry, Deep Space, etc.).`;

    const text = await executeGeminiWithRotation({
      taskName: "Nano Facts Reel Caption",
      contents: `
      ${topicPrompt}

      Use this EXACT structure:

      TOPIC: {topic name only}

      TITLE:
      {Topic Name} - {Short catchy subtitle, 4-8 words}

      CAPTION:

      Did you know {one mind-blowing fact or engaging hook question about the topic}?

      {Write ONLY 2 short, fascinating sentences explaining how it works, why it matters, or its futuristic impact. Make it educational, exciting, and accessible to anyone.}

      Unlock The Nano Facts Science Library
      Love learning? Help us unlock exclusive Science E-Books, Physics & Chemistry Study Guides, Biology materials, and downloadable PDF resources.

      Support our page & become a Subscriber:
      https://www.facebook.com/nanoscie/subscribe/

      Comment below: What science topic should be included in our next exclusive study guide?

      {10-15 comma-separated SEO keywords directly related to this topic, field of science, technology, research, discovery, education, STEM}

      Exactly 5 hashtags matching the topic:
      #Science #Technology #NanoFacts #STEM #{TopicOrField}

      Rules:
      - The first sentence must be a strong hook starting with "Did you know".
      - Do NOT use emojis. Clean and readable plain text only.
      - Facts must be scientifically accurate and up-to-date.
      - Keep sentences punchy and engaging for short-form video viewers.
      - Follow the exact formatting and line breaks shown above.
      `,
    });

    const topicMatch = text.match(/(?:\*\*|##\s*)?(?:TOPIC|ELEMENT):?\*?\*?\s*(.+)/i);
    const titleMatch = text.match(/(?:\*\*|##\s*)?TITLE:?\*?\*?\s*([\s\S]+?)(?=\n\s*(?:\*\*|##\s*)?CAPTION:|$)/i);
    const captionMatch = text.match(/(?:\*\*|##\s*)?CAPTION:?\*?\*?\s*([\s\S]+)/i);

    const topicName = topicMatch ? topicMatch[1].replace(/[*#_]/g, "").trim() : (initialTopic || null);
    const rawTitle = titleMatch ? titleMatch[1].replace(/[*#_]/g, "").trim() : null;
    const rawBody = captionMatch ? captionMatch[1].trim() : text;

    const boldTitle = rawTitle ? stringToUnicodeBold(rawTitle) : "";
    const boldBody = toUnicodeBold(rawBody);
    const caption = boldTitle ? `${boldTitle}\n\n${boldBody}` : boldBody;

    const category = await classifyReelCategory(topicName || initialTopic || text);

    return { topicName, rawTitle, caption, category };
  } catch (err) {
    console.error("[AI Service] [ERROR] Error generating Nano Facts Reel caption:", err.message);
    const fallbackCategory = await classifyReelCategory(initialTopic || "");
    return {
      topicName: initialTopic || null,
      rawTitle: initialTopic || null,
      caption: initialTopic ? toUnicodeBold(initialTopic) : null,
      category: fallbackCategory,
    };
  }
}

// Build titles and hashtags formatted specifically for YouTube Shorts
export function generateYouTubeShortsMetadata({ topicName = "Science Fact", category = "Science", rawTitle = null }) {
  const cleanCategory = (category || "Science").replace(/[^a-zA-Z0-9]/g, "");
  const baseTitle = rawTitle || topicName || "Mind-Blowing Science Discovery";

  // Format Title under 90 chars ending with #Shorts
  let title = `${baseTitle} #Shorts`;
  if (title.length > 95) {
    title = `${baseTitle.slice(0, 80).trim()}... #Shorts`;
  }

  const description = `${baseTitle}

Did you know this fascinating science discovery about ${topicName || "our universe"}?

Subscribe to our channel for more daily science, physics, biology and space facts.

#Shorts #Science #Technology #NanoFacts #${cleanCategory} #STEM #Educational`;

  const tags = [
    "Shorts",
    "Science",
    "Technology",
    "Nano Facts",
    "Science Facts",
    "Educational",
    "STEM",
    cleanCategory,
    topicName || "Science",
  ];

  return { title, description, tags };
}

// Create a friendly, natural AI reply to someone who commented on our post
export async function generateCommentReply({ userComment, postTopic = "our Facebook page", page = "astaPlays", userName = null }) {
  try {
    const persona = page === "nanoFacts"
      ? "Admin of Nano Facts (a page about science and chemistry facts)"
      : "Admin of Asta Plays (a gaming page focused on Mobile Legends: Bang Bang)";

    const reply = await executeGeminiWithRotation({
      taskName: `Comment Reply (${page})`,
      contents: `
      You are the friendly, helpful, and engaging Facebook page ${persona}.
      ${userName ? `The commenter's name is "${userName}".` : ""}
      A user commented: "${userComment}"
      The post topic is: "${postTopic}".

      Instructions:
      - Reply in natural, casual, and friendly English ONLY (do not use Tagalog or Taglish).
      - Keep it short, engaging, and conversational (1-2 sentences).
      ${userName ? `- If natural, greet them briefly by their first name (e.g., "Thanks, John!" or "Hey Sarah,").` : ""}
      - Do NOT use emojis. Clean and readable plain text only.
      - Do not include external links or spam.
      - Return plain text only.
      `,
    });

    return reply || null;
  } catch (err) {
    console.error("[AI Service] [ERROR] Error generating comment reply:", err.message);
    return null;
  }
}

// Create an AI reply for private Facebook Messenger chats
export async function generateMessengerChatReply({ userMessage, page = "astaPlays", userName = null }) {
  try {
    const personaDescription = page === "nanoFacts"
      ? `Admin of Nano Facts (a vibrant science and technology community). You are helpful, enthusiastic, and knowledgeable about science, chemistry, physics, and space. If the user asks for books, study guides, or exclusive PDF materials, you may share our official Subscriber Hub: https://www.facebook.com/nanoscie/subscribe/ .`
      : `Admin of Asta Plays (a Mobile Legends: Bang Bang gaming page). You are friendly, hype, and knowledgeable about MLBB hero builds, counter picks, spells, emblems, and ranked strategy.`;

    const reply = await executeGeminiWithRotation({
      taskName: `Messenger Chat Reply (${page})`,
      contents: `
      You are responding directly to a private Facebook Messenger direct message (DM).
      Your role: ${personaDescription}
      ${userName ? `The person messaging you is: "${userName}".` : ""}
      Their message: "${userMessage}"

      Instructions:
      - Respond in natural, friendly, and conversational English ONLY (do not use Tagalog/Taglish unless they explicitly speak Tagalog, but keep English preferred).
      - Keep your reply concise (1 to 3 short sentences) since this is a private chat.
      - Be direct and answer their question or acknowledge their message warmly.
      - Do NOT use emojis. Clean and readable text only.
      - Return plain text only without markdown asterisks or special headers.
      `,
    });

    return reply || null;
  } catch (err) {
    console.error("[AI Service] [ERROR] Error generating Messenger chat reply:", err.message);
    return null;
  }
}
