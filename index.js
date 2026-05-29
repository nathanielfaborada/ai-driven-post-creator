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
// SHOPEE — every hour, NO Gemini, template lang
// ─────────────────────────────────────────────

const SHOPEE_CATEGORIES = [
  { keyword: "shoes",      emoji: "👟", label: "Shoes",      tags: "#Shoes #ShoePH #Footwear"         },
  { keyword: "polo shirt", emoji: "👔", label: "Polo Shirt", tags: "#PoloShirt #MensFashion #OOTD"    },
  { keyword: "t-shirt",    emoji: "👕", label: "T-Shirt",    tags: "#TShirt #StreetWear #CasualFit"   },
  { keyword: "shorts",     emoji: "🩳", label: "Shorts",     tags: "#Shorts #SummerFit #CasualWear"   },
  { keyword: "pants",      emoji: "👖", label: "Pants",      tags: "#Pants #SlacksPH #FashionPH"      },
];

// Template captions — nag-ro-rotate para hindi paulit-ulit
const CAPTION_TEMPLATES = [
  (item, cat, price, link) =>
    `${cat.emoji} Handa ka na ba sa Back to School? 🎒\n\n✨ ${item.name}\n💰 ₱${price} lang sa Shopee!\n\nI-click ang link para makuha na! 👇\n${link}\n\n#StyleHuntPH #Shopee #BackToSchool ${cat.tags}`,

  (item, cat, price, link) =>
    `${cat.emoji} Level up ang fit mo ngayong Back to School! 🔥\n\n🛍️ ${item.name}\n💸 ₱${price} — sulit na sulit!\n\nAvailable na sa Shopee! 👇\n${link}\n\n#StyleHuntPH #Shopee #FreshFit ${cat.tags}`,

  (item, cat, price, link) =>
    `Psst! 👀 May nakita akong magandang deal sa Shopee!\n\n${cat.emoji} ${item.name}\n💰 ₱${price} only!\n\nBili na bago maubusan! 🛒\n${link}\n\n#StyleHuntPH #ShopeePH #DealAlert ${cat.tags}`,

  (item, cat, price, link) =>
    `Back to School outfit check! ✅\n\n${cat.emoji} ${item.name}\n💵 ₱${price} — affordable at maganda pa!\n\nI-order na sa Shopee! 🛍️\n${link}\n\n#StyleHuntPH #Shopee #BackToSchool2025 ${cat.tags}`,

  (item, cat, price, link) =>
    `Ang ganda nito, 'di ba? 😍\n\n${cat.emoji} ${item.name}\n🏷️ ₱${price} lang!\n\nMakikita mo ito sa Shopee — i-click ang link! 👇\n${link}\n\n#StyleHuntPH #ShopeePH #OOTDph ${cat.tags}`,
];

let categoryIndex  = 0;
let templateIndex  = 0;

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

async function runShopee() {
  // Rotate category
  const category = SHOPEE_CATEGORIES[categoryIndex % SHOPEE_CATEGORIES.length];
  categoryIndex++;

  console.log(`\n🛍️ [SHOPEE] Fetching ${category.label} products...`);
  const items = await fetchShopeeProducts(category.keyword);

  if (!items) {
    console.error("No products found, skipping post.");
    return;
  }

  // Pick random item from top 10 best sellers
  const pool = items.slice(0, 10);
  const item  = pool[Math.floor(Math.random() * pool.length)].item_basic;

  const price    = Math.round(item.price / 100000).toLocaleString();
  const imageUrl = item.image ? `https://cf.shopee.ph/file/${item.image}` : null;
  const affLink  = buildAffiliateLink(item.shopid, item.itemid, item.name);

  // Rotate caption template — no Gemini needed!
  const template = CAPTION_TEMPLATES[templateIndex % CAPTION_TEMPLATES.length];
  templateIndex++;
  const caption = template(item, category, price, affLink);

  console.log(`Product : ${item.name}`);
  console.log(`Price   : ₱${price}`);
  console.log(`Category: ${category.label}`);
  console.log(`Image   : ${imageUrl ?? "none"}`);
  console.log(`Caption :\n${caption}`);

  console.log("Posting to Facebook...");
  await postToFacebook(caption, imageUrl);
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

// Uncomment para mag-test agad:
// runMLBB();
// runShopee();

// MLBB — 6AM daily, Gemini-powered
schedule.scheduleJob("0 6 * * *", () => {
  console.log("⏰ [MLBB] Triggered:", new Date().toLocaleString());
  runMLBB();
});

// Shopee — every hour, NO Gemini
schedule.scheduleJob("0 * * * *", () => {
  console.log("⏰ [SHOPEE] Triggered:", new Date().toLocaleString());
  runShopee();
});

console.log("🚀 StyleHunt Bot is running!");
console.log("📅 MLBB post   : 6:00 AM daily (Gemini)");
console.log("📅 Shopee post : every hour (template, no Gemini)");
console.log(`📦 Categories  : ${SHOPEE_CATEGORIES.map(c => c.label).join(", ")}`);
console.log(`📝 Templates   : ${CAPTION_TEMPLATES.length} rotating captions`);