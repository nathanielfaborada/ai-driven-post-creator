import { GoogleGenAI } from "@google/genai";
import { config } from "../config/env.js";
import { stringToUnicodeBold, toUnicodeBold } from "../utils/formatters.js";

const aiAstaplays = new GoogleGenAI({ apiKey: config.astaPlays?.apiKey || "" });
const aiNanoFacts = new GoogleGenAI({ apiKey: config.nanoFacts?.apiKey || "" });

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

      
      {10–15 comma-separated SEO keywords including hero name, role, Mobile Legends, MLBB, gameplay, build guide, hero guide, ranked, esports, MOBA, strategy}

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
    const titleMatch = text.match(/TITLE:\s*([\s\S]+?)(?=\n\s*CAPTION:|$)/i);
    const captionMatch = text.match(/CAPTION:\s*([\s\S]+)/i);

    const heroName = heroMatch ? heroMatch[1].trim() : null;
    const rawTitle = titleMatch ? titleMatch[1].trim() : null;
    const rawBody = captionMatch ? captionMatch[1].trim() : text;

    const boldTitle = rawTitle ? stringToUnicodeBold(rawTitle) : "";
    const boldBody = toUnicodeBold(rawBody);
    const caption = boldTitle ? `${boldTitle}\n\n${boldBody}` : boldBody;

    return { heroName, caption };
  } catch (err) {
    console.error("Error generating Asta Plays caption:", err.message);
    return { heroName: null, caption: null };
  }
}

/**
 * Generate Science & Technology Facebook Post Caption for Nano Facts with Subscription CTA.
 * @returns {Promise<{ topicName: string|null, elementName: string|null, caption: string|null }>}
 */
export async function generateCaptionNanoFacts() {
  try {
    const response = await aiNanoFacts.models.generateContent({
      model: GEMINI_MODEL,
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
      {Topic Name} – {Short catchy subtitle, 4–8 words}

      CAPTION:

      Did you know {one mind-blowing fact or engaging hook question about the topic}? {1 relevant emoji}

      {Write ONLY 2 short, fascinating sentences explaining how it works, why it matters, or its futuristic impact. Make it educational, exciting, and accessible to anyone. Use 1–2 emojis.}

      🔓 Unlock The Nano Facts Science Library 🔬📚
      Love learning? Help us unlock exclusive Science E-Books, Physics & Chemistry Study Guides, Biology materials, and downloadable PDF resources!

      🌟 Support our page & become a Subscriber:
      👉 https://www.facebook.com/nanoscie/subscribe/

      👇 Comment below: What science topic should be included in our next exclusive study guide?

      {10–15 comma-separated SEO keywords directly related to this topic, field of science, technology, research, discovery, education, STEM}

      Exactly 5 hashtags matching the topic:
      #Science #Technology #NanoFacts #STEM #{TopicOrField}

      Rules:
      - The first sentence must be a strong hook starting with "Did you know".
      - Facts must be scientifically accurate and up-to-date.
      - Keep sentences punchy and engaging.
      - Follow the exact formatting and line breaks shown above.
      `,
    });

    const text = response.text.trim();
    const topicMatch = text.match(/(?:TOPIC|ELEMENT):\s*(.+)/i);
    const titleMatch = text.match(/TITLE:\s*([\s\S]+?)(?=\n\s*CAPTION:|$)/i);
    const captionMatch = text.match(/CAPTION:\s*([\s\S]+)/i);

    const topicName = topicMatch ? topicMatch[1].trim() : null;
    const rawTitle = titleMatch ? titleMatch[1].trim() : null;
    const rawBody = captionMatch ? captionMatch[1].trim() : text;

    const boldTitle = rawTitle ? stringToUnicodeBold(rawTitle) : "";
    const boldBody = toUnicodeBold(rawBody);
    const caption = boldTitle ? `${boldTitle}\n\n${boldBody}` : boldBody;

    return { topicName, elementName: topicName, caption };
  } catch (err) {
    console.error("Error generating Nano Facts caption:", err.message);
    return { topicName: null, elementName: null, caption: null };
  }
}

/**
 * Classify a science topic or caption into "Biology", "Periodic Table", or "General".
 * @param {string} text - Topic or text to classify
 * @returns {Promise<"Biology"|"Periodic Table"|"General">}
 */
export async function classifyReelCategory(text = "") {
  if (!text || !text.trim()) {
    return "General";
  }

  const lower = text.toLowerCase();
  
  // Fast keyword matching
  const bioKeywords = [
    "cell", "dna", "gene", "biology", "organ", "human body", "bacteria", "virus", 
    "evolution", "brain", "neuron", "mitochondria", "photosynthesis", "species", 
    "animal", "plant", "heart", "blood", "immune", "ecosystem", "protein", "enzyme"
  ];
  const chemKeywords = [
    "periodic table", "element", "chemistry", "atom", "molecule", "chemical", 
    "reaction", "proton", "electron", "neutron", "acid", "metal", "gas", "compound", 
    "oxygen", "hydrogen", "carbon", "gold", "iron", "uranium", "helium", "nitrogen"
  ];

  const hasBio = bioKeywords.some((k) => lower.includes(k));
  const hasChem = chemKeywords.some((k) => lower.includes(k));

  if (hasBio && !hasChem) return "Biology";
  if (hasChem && !hasBio) return "Periodic Table";

  // AI fallback classification if ambiguous
  try {
    const res = await aiNanoFacts.models.generateContent({
      model: GEMINI_MODEL,
      contents: `
      Classify the following science topic into EXACTLY ONE of these categories: "Biology", "Periodic Table", or "General".
      Topic: "${text}"

      Respond with ONLY the category name.
      `,
    });

    const category = res.text.trim();
    if (category.includes("Biology")) return "Biology";
    if (category.includes("Periodic")) return "Periodic Table";
    return "General";
  } catch {
    return hasBio ? "Biology" : hasChem ? "Periodic Table" : "General";
  }
}

/**
 * Generate an AI-powered SEO & engagement caption for Facebook Reels based on the incoming Telegram caption/topic.
 * @param {string} [initialTopic] - Topic or raw caption provided via Telegram
 * @returns {Promise<{ topicName: string|null, caption: string|null, category: "Biology"|"Periodic Table"|"General" }>}
 */
export async function generateReelCaptionNanoFacts(initialTopic = "") {
  try {
    const topicPrompt = initialTopic?.trim()
      ? `The creator provided this topic/context for the video reel: "${initialTopic.trim()}". Generate an engaging, high-retention Facebook Reel caption based specifically on this video topic.`
      : `Generate a short, SEO-optimized Facebook Reel caption about a fascinating topic in SCIENCE & TECHNOLOGY. Pick randomly from diverse fields (Astronomy, Quantum Physics, Biology, Nanotechnology, AI, Chemistry, Deep Space, etc.).`;

    const response = await aiNanoFacts.models.generateContent({
      model: GEMINI_MODEL,
      contents: `
      ${topicPrompt}

      Use this EXACT structure:

      TOPIC: {topic name only}

      TITLE:
      {Topic Name} – {Short catchy subtitle, 4–8 words}

      CAPTION:

      Did you know {one mind-blowing fact or engaging hook question about the topic}? {1 relevant emoji}

      {Write ONLY 2 short, fascinating sentences explaining how it works, why it matters, or its futuristic impact. Make it educational, exciting, and accessible to anyone. Use 1–2 emojis.}

      🔓 Unlock The Nano Facts Science Library 🔬📚
      Love learning? Help us unlock exclusive Science E-Books, Physics & Chemistry Study Guides, Biology materials, and downloadable PDF resources!

      🌟 Support our page & become a Subscriber:
      👉 https://www.facebook.com/nanoscie/subscribe/

      👇 Comment below: What science topic should be included in our next exclusive study guide?

      {10–15 comma-separated SEO keywords directly related to this topic, field of science, technology, research, discovery, education, STEM}

      Exactly 5 hashtags matching the topic:
      #Science #Technology #NanoFacts #STEM #{TopicOrField}

      Rules:
      - The first sentence must be a strong hook starting with "Did you know".
      - Facts must be scientifically accurate and up-to-date.
      - Keep sentences punchy and engaging for short-form video viewers.
      - Follow the exact formatting and line breaks shown above.
      `,
    });

    const text = response.text.trim();
    const topicMatch = text.match(/(?:TOPIC|ELEMENT):\s*(.+)/i);
    const titleMatch = text.match(/TITLE:\s*([\s\S]+?)(?=\n\s*CAPTION:|$)/i);
    const captionMatch = text.match(/CAPTION:\s*([\s\S]+)/i);

    const topicName = topicMatch ? topicMatch[1].trim() : (initialTopic || null);
    const rawTitle = titleMatch ? titleMatch[1].trim() : null;
    const rawBody = captionMatch ? captionMatch[1].trim() : text;

    const boldTitle = rawTitle ? stringToUnicodeBold(rawTitle) : "";
    const boldBody = toUnicodeBold(rawBody);
    const caption = boldTitle ? `${boldTitle}\n\n${boldBody}` : boldBody;

    const category = await classifyReelCategory(topicName || initialTopic || text);

    return { topicName, caption, category };
  } catch (err) {
    console.error("Error generating Nano Facts Reel caption:", err.message);
    const fallbackCategory = await classifyReelCategory(initialTopic || "");
    return {
      topicName: initialTopic || null,
      caption: initialTopic ? toUnicodeBold(initialTopic) : null,
      category: fallbackCategory,
    };
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

/**
 * Generate an AI direct message response for 1-on-1 Facebook Messenger chat.
 * @param {Object} params
 * @param {string} params.userMessage
 * @param {"astaPlays"|"nanoFacts"} [params.page]
 * @param {string|null} [params.userName]
 * @returns {Promise<string|null>}
 */
export async function generateMessengerChatReply({ userMessage, page = "astaPlays", userName = null }) {
  try {
    const aiInstance = page === "nanoFacts" ? aiNanoFacts : aiAstaplays;
    const personaDescription = page === "nanoFacts"
      ? `Admin of Nano Facts (a vibrant science and technology community). You are helpful, enthusiastic, and knowledgeable about science, chemistry, physics, and space. If the user asks for books, study guides, or exclusive PDF materials, you may share our official Subscriber Hub: https://www.facebook.com/nanoscie/subscribe/ .`
      : `Admin of Asta Plays (a Mobile Legends: Bang Bang gaming page). You are friendly, hype, and knowledgeable about MLBB hero builds, counter picks, spells, emblems, and ranked strategy.`;

    const response = await aiInstance.models.generateContent({
      model: GEMINI_MODEL,
      contents: `
      You are responding directly to a private Facebook Messenger direct message (DM).
      Your role: ${personaDescription}
      ${userName ? `The person messaging you is: "${userName}".` : ""}
      Their message: "${userMessage}"

      Instructions:
      - Respond in natural, friendly, and conversational English ONLY (do not use Tagalog/Taglish unless they explicitly speak Tagalog, but keep English preferred).
      - Keep your reply concise (1 to 3 short sentences) since this is a private chat.
      - Be direct and answer their question or acknowledge their message warmly.
      - Use 1–2 relevant emojis.
      - Return plain text only without markdown asterisks or special headers.
      `,
    });

    return response.text.trim();
  } catch (err) {
    console.error("[AI Service] Error generating Messenger chat reply:", err.message);
    return null;
  }
}



