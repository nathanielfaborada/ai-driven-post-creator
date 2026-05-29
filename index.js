import "dotenv/config";
import axios from "axios";
import { GoogleGenAI } from "@google/genai";
import schedule from "node-schedule";

const ai = new GoogleGenAI({ apiKey: process.env.OPENAI_API_KEY });
const FB_PAGE_ID = process.env.FB_PAGE_ID;
const FB_PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;
const AFFILIATE_ID = process.env.SHOPEE_AFFILIATE_ID || "13368340443";

// ─────────────────────────────────────────────
// MOBILE LEGENDS — 6AM daily, Gemini-powered
// ─────────────────────────────────────────────

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
    const res = await axios.get(
      `https://openmlbb.fastapicloud.dev/api/heroes/${encodedName}`
    );
    const headBig = res.data?.data?.records?.[0]?.data?.head_big;
    return headBig || null;
  } catch (err) {
    console.error("Could not fetch hero image:", err.message);
    return null;
  }
}

async function runMLBB() {
  console.log("\n🎮 [MLBB] Generating caption...");
  const { heroName, caption } = await generateCaption();
  console.log("Hero:", heroName);
  console.log("Caption:\n", caption);

  let imageUrl = null;
  if (heroName) {
    console.log("Fetching hero image...");
    imageUrl = await getHeroImage(heroName);
    console.log("Image URL:", imageUrl ?? "Not found, posting text only");
  }

  console.log("Posting to Facebook...");
  await postToFacebook(caption, imageUrl);
}

// ─────────────────────────────────────────────
// SHOPEE — every hour, NO Gemini, NO API fetch
// Gumagamit ng Shopee Search URL + affiliate tag
// Facebook mismo ang mag-ge-generate ng preview!
// ─────────────────────────────────────────────

const SHOPEE_CATEGORIES = [
  {
    keyword: "shoes",
    searchUrl: "https://shopee.ph/search?keyword=shoes&sortBy=sales",
    emoji: "👟",
    label: "Shoes",
    tags: "#Shoes #ShoePH #Footwear #BackToSchool",
  },
  {
    keyword: "polo shirt",
    searchUrl: "https://shopee.ph/search?keyword=polo+shirt&sortBy=sales",
    emoji: "👔",
    label: "Polo Shirt",
    tags: "#PoloShirt #MensFashion #OOTD #BackToSchool",
  },
  {
    keyword: "t-shirt",
    searchUrl: "https://shopee.ph/search?keyword=t-shirt&sortBy=sales",
    emoji: "👕",
    label: "T-Shirt",
    tags: "#TShirt #StreetWear #CasualFit #BackToSchool",
  },
  {
    keyword: "shorts",
    searchUrl: "https://shopee.ph/search?keyword=shorts&sortBy=sales",
    emoji: "🩳",
    label: "Shorts",
    tags: "#Shorts #SummerFit #CasualWear #BackToSchool",
  },
  {
    keyword: "pants",
    searchUrl: "https://shopee.ph/search?keyword=pants&sortBy=sales",
    emoji: "👖",
    label: "Pants",
    tags: "#Pants #SlacksPH #FashionPH #BackToSchool",
  },
];

// Build affiliate link gamit ang Shopee Search URL
// Facebook will auto-generate a preview from the Shopee page!
function buildSearchAffLink(category) {
  const encoded = encodeURIComponent(category.searchUrl);
  return `https://s.shopee.ph/an_redir?origin_link=${encoded}&affiliate_id=${AFFILIATE_ID}&sub_id=${category.keyword.replace(/\s+/g, "_")}`;
}

// 5 rotating caption templates — walang Gemini, walang API
const CAPTION_TEMPLATES = [
  (cat, link) =>
    `${cat.emoji} Back to School na! Handa ka na ba ang outfit mo? 🎒\n\nTingnan ang pinakabagong ${cat.label} sa Shopee — best sellers, best prices!\n\n🛍️ I-click ang link para mag-browse! 👇\n${link}\n\n#StyleHuntPH #Shopee ${cat.tags}`,

  (cat, link) =>
    `Level up ang fit mo ngayong Back to School! 🔥\n\n${cat.emoji} Ang daming pagpipilian ng ${cat.label} sa Shopee!\nLahat affordable, lahat may libre shipping!\n\n👇 Shop na dito!\n${link}\n\n#StyleHuntPH #ShopeePH #FreshFit ${cat.tags}`,

  (cat, link) =>
    `Psst! 👀 Naghahanap ng magandang ${cat.label}?\n\nNandito na ang sagot mo — pinaka-best selling ${cat.label} sa Shopee PH! ${cat.emoji}\n\nI-click na! 🛒\n${link}\n\n#StyleHuntPH #DealAlert #ShopeePH ${cat.tags}`,

  (cat, link) =>
    `${cat.emoji} Outfit check! ✅\n\nBack to School season na — siguraduhing fresh ang fit mo!\nI-browse ang mga ${cat.label} sa Shopee ngayon!\n\n🔗 Link dito 👇\n${link}\n\n#StyleHuntPH #Shopee #BackToSchool2025 ${cat.tags}`,

  (cat, link) =>
    `Ang daming magagandang ${cat.label} sa Shopee! 😍 ${cat.emoji}\n\nAffordable, trendy, at mabilis pang ma-deliver!\nPerfect para sa Back to School season!\n\n👇 I-check na!\n${link}\n\n#StyleHuntPH #OOTDph #ShopeePH ${cat.tags}`,
];

let categoryIndex = 0;
let templateIndex = 0;

async function runShopee() {
  // Rotate category
  const category = SHOPEE_CATEGORIES[categoryIndex % SHOPEE_CATEGORIES.length];
  categoryIndex++;

  // Build affiliate link — Shopee Search URL + affiliate tag
  // No API call needed! Facebook generates preview automatically.
  const affLink = buildSearchAffLink(category);

  // Rotate caption template
  const template = CAPTION_TEMPLATES[templateIndex % CAPTION_TEMPLATES.length];
  templateIndex++;
  const caption = template(category, affLink);

  console.log(`\n🛍️ [SHOPEE] Posting ${category.label}...`);
  console.log(`Link    : ${affLink}`);
  console.log(`Caption :\n${caption}`);

  // Post as TEXT ONLY — Facebook will auto-generate
  // the Shopee preview (image + title + description)!
  await postTextToFacebook(caption);
}

// ─────────────────────────────────────────────
// FACEBOOK — post functions
// ─────────────────────────────────────────────

// For MLBB — posts with image
async function postToFacebook(caption, imageUrl) {
  if (!caption) return;
  try {
    if (imageUrl) {
      const url = `https://graph.facebook.com/v24.0/${FB_PAGE_ID}/photos`;
      const res = await axios.post(url, {
        url: imageUrl,
        message: caption,
        access_token: FB_PAGE_ACCESS_TOKEN,
      });
      console.log("✅ Posted with image! Post ID:", res.data.id);
    } else {
      await postTextToFacebook(caption);
    }
  } catch (err) {
    console.error("❌ FB error:", err.response?.data || err.message);
  }
}

// For Shopee — posts text + link (Facebook auto-generates Shopee preview)
async function postTextToFacebook(caption) {
  try {
    const url = `https://graph.facebook.com/v24.0/${FB_PAGE_ID}/feed`;
    const res = await axios.post(url, {
      message: caption,
      access_token: FB_PAGE_ACCESS_TOKEN,
    });
    console.log("✅ Posted! Post ID:", res.data.id);
  } catch (err) {
    console.error("❌ FB error:", err.response?.data || err.message);
  }
}

// ─────────────────────────────────────────────
// SCHEDULES
// ─────────────────────────────────────────────

// Uncomment to test immediately:
// runMLBB();
// runShopee();

// MLBB — 6AM daily, Gemini-powered
schedule.scheduleJob("0 6 * * *", () => {
  console.log("⏰ [MLBB] Triggered:", new Date().toLocaleString());
  runMLBB();
});

// Shopee — every hour, zero API calls, zero Gemini
schedule.scheduleJob("0 * * * *", () => {
  console.log("⏰ [SHOPEE] Triggered:", new Date().toLocaleString());
  runShopee();
});

console.log("🚀 StyleHunt Bot is running!");
console.log("📅 MLBB post   : 6:00 AM daily (Gemini)");
console.log("📅 Shopee post : every hour (no API, no Gemini, fully automatic)");
console.log(`📦 Categories  : ${SHOPEE_CATEGORIES.map(c => c.label).join(", ")}`);
console.log(`📝 Templates   : ${CAPTION_TEMPLATES.length} rotating captions`);
console.log("🔗 Method      : Shopee Search URL + affiliate tag → FB auto-preview");