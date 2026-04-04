import "dotenv/config";
import axios from "axios";
import { GoogleGenAI } from "@google/genai";
import schedule from "node-schedule";

const ai = new GoogleGenAI({ apiKey: process.env.OPENAI_API_KEY });

const FB_PAGE_ID = process.env.FB_PAGE_ID;
const FB_PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;

async function generateCaption() {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `
    Generate a short Mobile Legends hero output in this exact structure:

    HERO: {hero name only, no extra text}
    CAPTION: **Who is {hero name}?** {Short description of that hero}

    Requirements:
    - Random Mobile Legends hero name
    - Description must be 1–5 sentences only
    - Description must be motivational/inspirational
    - Use emojis
    - Add hashtags related to Mobile Legends
    `,
  });

  const text = response.text.trim();

  const heroMatch = text.match(/HERO:\s*(.+)/i);
  const captionMatch = text.match(/CAPTION:\s*([\s\S]+)/i);

  const heroName = heroMatch ? heroMatch[1].trim() : null;
  const caption = captionMatch ? captionMatch[1].trim() : text;

  return { heroName, caption };
}

async function getHeroImage(heroName) {
  try {
    const encodedName = encodeURIComponent(heroName);
    const res = await axios.get(`https://mlbb.rone.dev/api/heroes/${encodedName}`);
    const headBig = res.data?.data?.records?.[0]?.data?.head_big;
    return headBig || null;
  } catch (err) {
    console.error("Could not fetch hero image:", err.message);
    return null;
  }
}

async function postToFacebook(caption, imageUrl) {
  if (!caption) return;

  try {
    if (imageUrl) {
      // Post with image using Photos API
      const url = `https://graph.facebook.com/v24.0/${FB_PAGE_ID}/photos`;
      const res = await axios.post(url, {
        url: imageUrl,
        message: caption,
        access_token: FB_PAGE_ACCESS_TOKEN,
      });
      console.log("Posted with image! Post ID:", res.data.id);
    } else {
      // Fallback: post text only if no image found
      const url = `https://graph.facebook.com/v24.0/${FB_PAGE_ID}/feed`;
      const res = await axios.post(url, {
        message: caption,
        access_token: FB_PAGE_ACCESS_TOKEN,
      });
      console.log("Posted (text only)! Post ID:", res.data.id);
    }
  } catch (err) {
    console.error("Error posting to Facebook:", err.response?.data || err.message);
  }
}

async function run() {
  console.log("Generating caption...");
  const { heroName, caption } = await generateCaption();
  console.log("Hero:", heroName);
  console.log("Caption:\n", caption);

  let imageUrl = null;
  if (heroName) {
    console.log("Fetching hero image...");
    imageUrl = await getHeroImage(heroName);
    console.log("Image URL:", imageUrl ?? "Not found, will post text only");
  }

  console.log("Posting to Facebook...");
  await postToFacebook(caption, imageUrl);
}

run();

// For testing every 2 mins — uncomment below, comment out the one below it
// schedule.scheduleJob('*/2 * * * *', () => {
//   console.log("Scheduled job triggered at", new Date().toLocaleString());
//   run();
// });

schedule.scheduleJob('0 6,18 * * *', () => {
  console.log("Scheduled job triggered at", new Date().toLocaleString());
  run();
});
