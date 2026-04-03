import "dotenv/config";
import axios from "axios";
import { GoogleGenAI } from "@google/genai";


import schedule from "node-schedule";

const ai = new GoogleGenAI({ apiKey: process.env.OPENAI_API_KEY });

// Facebook credentials
const FB_PAGE_ID = process.env.FB_PAGE_ID;
const FB_PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;

// For mobile legends 
async function generateCaption() {

    const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `
    Generate a short Mobile Legends hero output in this structure:

  "**Who is {Mobile Legends hero name} ?**
  {Short description of that hero}"

  Requirements:
  - Random Mobile Legends hero name
  - Description must be 1–5 sentences only
  - Description must be motivational/inspirational
  - Use emojis
  - Add hashtag that connects in mobile legends
    `,
  });
//   console.log(response.text);
  return response.text;
}

async function postToFacebook(caption) {
  if (!caption) return;

  const url = `https://graph.facebook.com/v24.0/${FB_PAGE_ID}/feed`;

  try {
    const res = await axios.post(
      url,
      {
        message: caption,
        access_token: FB_PAGE_ACCESS_TOKEN,
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    console.log("Posted successfully! Post ID:", res.data.id);
  } catch (err) {
    console.error("Error posting to Facebook:", err.response?.data || err.message);
  }
}



async function run() {
  
  const caption = await generateCaption();


  console.log("Caption:\n", caption);
  console.log("Posting to Facebook...");
  await postToFacebook(caption);
}

run();

// schedule.scheduleJob('*/2 * * * *', () => {
//   console.log("Scheduled job triggered at", new Date().toLocaleString());
//   run();
// });


schedule.scheduleJob('0 6,18 * * *', () => {
  console.log("Scheduled job triggered at", new Date().toLocaleString());
  run();
});