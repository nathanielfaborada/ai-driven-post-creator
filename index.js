import "dotenv/config";
import axios from "axios";
import { GoogleGenAI } from "@google/genai";
import schedule from "node-schedule";

const ai = new GoogleGenAI({ apiKey: process.env.OPENAI_API_KEY });
const FB_PAGE_ID = process.env.FB_PAGE_ID;
const FB_PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;
const AFFILIATE_ID = process.env.SHOPEE_AFFILIATE_ID || "13368340443";

// ─────────────────────────────────────────────
// MOBILE LEGENDS — existing logic
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
// SHOPEE — new logic
// ─────────────────────────────────────────────

// Category list — nag-ro-rotate para varied ang posts
const SHOPEE_CATEGORIES = [
  { keyword: "shoes",      emoji: "👟", label: "Shoes"      },
  { keyword: "polo shirt", emoji: "👔", label: "Polo Shirt" },
  { keyword: "t-shirt",    emoji: "👕", label: "T-Shirt"    },
  { keyword: "shorts",     emoji: "🩳", label: "Shorts"     },
  { keyword: "pants",      emoji: "👖", label: "Pants"      },
];

let categoryIndex = 0; // rotates each post

// Build affiliate link — no API key needed, formula lang
function buildAffiliateLink(shopid, itemid, name) {
  const slug = name
    .replace(/[^a-z0-9\s]/gi, "")
    .replace(/\s+/g, "-")
    .toLowerCase()
    .slice(0, 60);
  const productUrl = `https://shopee.ph/${slug}-i.${shopid}.${itemid}`;
  const encoded = encodeURIComponent(productUrl);
  return `https://s.shopee.ph/an_redir?origin_link=${encoded}&affiliate_id=${AFFILIATE_ID}&sub_id=stylehunt`;
}

// Fetch products from Shopee
async function fetchShopeeProducts(keyword) {
  try {
    const res = await axios.get(
      "https://shopee.ph/api/v4/search/search_items",
      {
        params: {
          keyword,
          limit: 30,
          by: "sales",
          order: "desc",
          page_type: "search",
          version: 2,
          newest: 0,
        },
        headers: {
          "accept": "application/json",
          "x-api-source": "pc",
          "x-shopee-language": "en",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
          "Referer": "https://shopee.ph/",
        },
        timeout: 10000,
      }
    );

    const items = res.data?.items;
    if (!items?.length) throw new Error("No items returned");
    return items;
  } catch (err) {
    console.error("Shopee fetch error:", err.message);
    return null;
  }
}

// Generate AI caption for Shopee product
async function generateShopeeCaption(product, category) {
  const price = Math.round(product.price / 100000);
  const discount = product.raw_discount ? `${product.raw_discount}% OFF` : "";
  const sold = product.historical_sold?.toLocaleString() ?? "0";

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `
    Generate a short Facebook product post for a Shopee fashion item.
    
    Product: ${product.name}
    Category: ${category.label}
    Price: ₱${price}
    Discount: ${discount || "none"}
    Items sold: ${sold}
    
    Output in this exact structure:
    CAPTION: {your caption here}
    
    Requirements:
    - Written in Filipino/Tagalog mixed with English (like how Filipinos post on Facebook)
    - Exciting and conversational tone
    - Mention the price
    - Mention it's from Shopee
    - 3–5 sentences only
    - Use relevant emojis
    - Add hashtags: #StyleHuntPH #Shopee #BackToSchool and category-related tags
    - End with "Link sa bio! 🔗" or "I-click ang link! 👇"
    `,
  });

  const text = response.text.trim();
  const captionMatch = text.match(/CAPTION:\s*([\s\S]+)/i);
  return captionMatch ? captionMatch[1].trim() : text;
}

// Main Shopee post runner
async function runShopee() {
  // Pick category (rotates every call)
  const category = SHOPEE_CATEGORIES[categoryIndex % SHOPEE_CATEGORIES.length];
  categoryIndex++;

  console.log(`\n🛍️ [SHOPEE] Fetching ${category.label} products...`);
  const items = await fetchShopeeProducts(category.keyword);

  if (!items) {
    console.error("No products found, skipping post.");
    return;
  }

  // Pick a random item from top 10 best sellers
  const pool = items.slice(0, 10);
  const item = pool[Math.floor(Math.random() * pool.length)].item_basic;

  const price = Math.round(item.price / 100000);
  const imageUrl = item.image
    ? `https://cf.shopee.ph/file/${item.image}`
    : null;
  const affLink = buildAffiliateLink(item.shopid, item.itemid, item.name);

  console.log(`Product: ${item.name}`);
  console.log(`Price: ₱${price}`);
  console.log(`Image: ${imageUrl ?? "none"}`);
  console.log(`Affiliate Link: ${affLink}`);

  // Generate AI caption
  console.log("Generating AI caption...");
  const caption = await generateShopeeCaption(item, category);
  const fullCaption = `${caption}\n\n🔗 ${affLink}`;
  console.log("Caption:\n", fullCaption);

  // Post to Facebook
  console.log("Posting to Facebook...");
  await postToFacebook(fullCaption, imageUrl);
}

// ─────────────────────────────────────────────
// FACEBOOK — shared post function
// ─────────────────────────────────────────────

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
      const url = `https://graph.facebook.com/v24.0/${FB_PAGE_ID}/feed`;
      const res = await axios.post(url, {
        message: caption,
        access_token: FB_PAGE_ACCESS_TOKEN,
      });
      console.log("✅ Posted (text only)! Post ID:", res.data.id);
    }
  } catch (err) {
    console.error(
      "❌ Error posting to Facebook:",
      err.response?.data || err.message
    );
  }
}

// ─────────────────────────────────────────────
// SCHEDULES
// ─────────────────────────────────────────────

// Test mode — uncomment to run immediately
// runMLBB();
// runShopee();

// MLBB post — 6AM daily
schedule.scheduleJob("0 6 * * *", () => {
  console.log("⏰ MLBB schedule triggered:", new Date().toLocaleString());
  runMLBB();
});

// Shopee fashion post — 12NN and 6PM daily (rotates categories automatically)
schedule.scheduleJob("0 12 * * *", () => {
  console.log("⏰ Shopee schedule triggered (12NN):", new Date().toLocaleString());
  runShopee();
});

schedule.scheduleJob("0 18 * * *", () => {
  console.log("⏰ Shopee schedule triggered (6PM):", new Date().toLocaleString());
  runShopee();
});

console.log("🚀 Bot is running!");
console.log("📅 MLBB post:   6:00 AM daily");
console.log("📅 Shopee post: 12:00 PM + 6:00 PM daily");
