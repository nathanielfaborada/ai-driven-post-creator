# Facebook, YouTube & TikTok AI-Driven Automation Engine

A production-grade multi-platform automation backend built with Node.js that powers 24/7 scheduled content creation, multi-channel Telegram video reels ingestion, **Facebook Reels, YouTube Shorts & TikTok Triple Cross-Posting**, intelligent comment auto-responding, and 10-category evergreen content recycling.

---

## 🌟 Managed Social Channels & Pages

* **Nano Facts** — Science, Deep Space & Technology Page
  * Facebook Page: [facebook.com/nanoscie](https://www.facebook.com/nanoscie)
  * YouTube Channel: [youtube.com/@nielskysgamingtv1835](https://www.youtube.com/@nielskysgamingtv1835)
  * TikTok Account: [tiktok.com/@nanoscie](https://www.tiktok.com/@nanoscie)
  * Subscription Hub: [facebook.com/nanoscie/subscribe](https://www.facebook.com/nanoscie/subscribe/)
  * Portal & Legal: [nanofacts-automation.netlify.app](https://nanofacts-automation.netlify.app/)
* **Asta Plays** — Mobile Legends: Bang Bang (MLBB) Gaming Page
  * Facebook Page: [facebook.com/astaplasys05](https://www.facebook.com/astaplasys05)

---

## 🚀 Core Systems & Architecture

```mermaid
flowchart TD
    subgraph Telegram_Inlet["Telegram Ingestion & 10-Category Archiving"]
        CreatorUpload["Creator drops video"] --> ChQueue["Channel 1: FB Reels to Post (Queue)"]
        SeedBio["Seed 20 Biology Reels"] --> Ch1["Channel: Human Biology & Anatomy"]
        SeedChem["Seed 20 Chemistry Reels"] --> Ch2["Channel: Chemistry & Periodic Table"]
        SeedAstro["Seed 20 Astronomy Reels"] --> Ch3["Channel: Astronomy & Deep Space"]
        SeedOther["Seed 20 Reels per Channel"] --> Ch4_10["Channels 4–10 (Physics, AI, Ocean, Earth, Materials, Paleo, Rockets)"]
        
        ChQueue & Ch1 & Ch2 & Ch3 & Ch4_10 --> TGListener["Telegram Long-Polling Listener"]
    end

    subgraph Supabase_Cloud["Supabase PostgreSQL Cloud DB"]
        TGListener -->|Queue new uploads| SupaQueue[("Table: reels_queue\n(FIFO Pending)")]
        TGListener -->|Direct seed into categories| SupaArchive[("Table: reels_archive\n(10-Category Evergreen Library)")]
    end

    subgraph Core_Engine["Automation Schedulers & Workers"]
        CronSched["node-schedule"] --> ReelsWorker["Triple Cross-Posting Worker\n(Every 4 Hours + Startup)"]
        CronSched --> TextWorker["Text Content Worker\n(Every 5 Hours + Startup)"]
        CronSched --> CommentWorker["Comment Responder Worker\n(Fast Polling Every 2m)"]
    end

    subgraph AI_Intelligence["Google Gemini AI Pool"]
        ReelsWorker -->|Expand Caption & Classify| GeminiReels["Gemini 3.6 Flash / 3.5 Flash\n(FB Caption & 10-Category Router)"]
        ReelsWorker -->|Generate YouTube SEO Metadata| GeminiYT["Gemini 3.6 Flash\n(Shorts Title, Description, Tags)"]
        TextWorker -->|Generate Science & Gaming Posts| GeminiText["Gemini 3.6 Flash\n(Post Creator)"]
        CommentWorker -->|Generate Contextual Reply| GeminiComment["Gemini 3.6 Flash\n(Persona Responder)"]
    end

    subgraph Social_Platforms["Triple-Platform Social Distribution"]
        ReelsWorker -->|1. Publish Facebook Reel| FBReelsAPI["Facebook: /{pageId}/video_reels"]
        ReelsWorker -->|2. Cross-Post YouTube Short| YTShortsAPI["YouTube: /videos.insert (Shorts)"]
        ReelsWorker -->|3. Cross-Post TikTok Video| TTApi["TikTok: /v2/post/publish/video/init/"]
        TextWorker -->|Publish Feed Post| FBFeedAPI["Facebook: /{pageId}/feed"]
        CommentWorker -->|Post Sub-Comment Reply| FBCommentAPI["Facebook: /{commentId}/comments"]
    end

    ReelsWorker -->|copyMessage to respective Category Archive| Ch1 & Ch2 & Ch3 & Ch4_10
    ReelsWorker -->|deleteMessage from Queue| ChQueue
    ReelsWorker -->|Update repost_count += 1| SupaArchive
```

---

## 🗄️ Supabase Database Setup

Run this SQL script in your **Supabase Dashboard > SQL Editor**:

```sql
-- 1. Table para sa Pending Telegram Queue (FIFO)
CREATE TABLE IF NOT EXISTS reels_queue (
    id BIGSERIAL PRIMARY KEY,
    message_id BIGINT UNIQUE NOT NULL,
    file_id TEXT NOT NULL,
    caption TEXT DEFAULT '',
    file_size BIGINT,
    duration INT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Table para sa Permanent Archive / 10-Category Evergreen Library
CREATE TABLE IF NOT EXISTS reels_archive (
    id BIGSERIAL PRIMARY KEY,
    file_id TEXT UNIQUE NOT NULL,
    category TEXT NOT NULL DEFAULT 'General',
    caption TEXT DEFAULT '',
    original_posted_at TIMESTAMPTZ DEFAULT NOW(),
    last_reposted_at TIMESTAMPTZ,
    repost_count INT DEFAULT 0,
    fb_video_id TEXT
);

-- Indexes para mabilis ang query
CREATE INDEX IF NOT EXISTS idx_reels_archive_category ON reels_archive(category);
CREATE INDEX IF NOT EXISTS idx_reels_archive_repost ON reels_archive(repost_count ASC);
```

---

## 🌟 10-Category Telegram Archive Structure

| # | Category Name | Emoji | Telegram Channel Env Key |
| :---: | :--- | :---: | :--- |
| **1** | **Human Biology & Anatomy** | 🧬 | `TG_CHANNEL_BIOLOGY_ID` |
| **2** | **Chemistry & Periodic Table** | ⚛️ | `TG_CHANNEL_CHEMISTRY_ID` |
| **3** | **Astronomy & Deep Space** | 🌌 | `TG_CHANNEL_ASTRONOMY_ID` |
| **4** | **Quantum & Modern Physics** | ⚡ | `TG_CHANNEL_PHYSICS_ID` |
| **5** | **AI, Robotics & Future Technology** | 🤖 | `TG_CHANNEL_ROBOTICS_ID` |
| **6** | **Deep Sea & Ocean Mysteries** | 🌊 | `TG_CHANNEL_OCEAN_ID` |
| **7** | **Earth Sciences & Extreme Nature** | 🌋 | `TG_CHANNEL_EARTH_ID` |
| **8** | **Materials Science & Nanotechnology** | 🔬 | `TG_CHANNEL_MATERIALS_ID` |
| **9** | **Paleontology & Prehistoric Life** | 🦖 | `TG_CHANNEL_PALEONTOLOGY_ID` |
| **10** | **Rocket Science & Space Missions** | 🚀 | `TG_CHANNEL_ROCKETS_ID` |

---

## ⏰ 24-Hour Schedule Matrix

| Time | Facebook Reels + YouTube Shorts + TikTok | Nano Facts (Science Post) | Asta Plays (MLBB Post) |
| :---: | :---: | :---: | :---: |
| **12:00 AM** | 🎬 Cross-Post 3 Platforms | — | — |
| **1:00 AM** | — | 🔬 Publish Post | 🎮 Publish Post |
| **4:00 AM** | 🎬 Cross-Post 3 Platforms | — | — |
| **6:00 AM** | — | 🔬 Publish Post | 🎮 Publish Post |
| **8:00 AM** | 🎬 Cross-Post 3 Platforms | — | — |
| **11:00 AM** | — | 🔬 Publish Post | 🎮 Publish Post |
| **12:00 PM** | 🎬 Cross-Post 3 Platforms | — | — |
| **4:00 PM** | 🎬 Cross-Post 3 Platforms | 🔬 Publish Post | 🎮 Publish Post |
| **8:00 PM** | 🎬 Cross-Post 3 Platforms | — | — |
| **9:00 PM** | — | 🔬 Publish Post | 🎮 Publish Post |

---

## 🔑 Environment Variables Reference

| Variable | Description |
| :--- | :--- |
| `GEMINI_PROJECT_1` .. `_10` | Google Gemini API Keys Pool (Round-Robin & Auto-Failover) |
| `FB_PAGE_ID_ASTA_PLAYS` | Facebook Page ID for Asta Plays |
| `FB_PAGE_ACCESS_TOKEN_ASTA_PLAYS` | Permanent Page Access Token for Asta Plays |
| `FB_PAGE_ID_NANO_FACTS` | Facebook Page ID for Nano Facts |
| `FB_PAGE_ACCESS_TOKEN_NANO_FACTS` | Permanent Page Access Token for Nano Facts |
| `YOUTUBE_CLIENT_ID` | Google Cloud OAuth2 Client ID |
| `YOUTUBE_CLIENT_SECRET` | Google Cloud OAuth2 Client Secret |
| `YOUTUBE_REFRESH_TOKEN` | Google OAuth2 Refresh Token for YouTube |
| `TIKTOK_CLIENT_KEY` | TikTok Content Posting API Client Key |
| `TIKTOK_CLIENT_SECRET` | TikTok Content Posting API Client Secret |
| `TIKTOK_REFRESH_TOKEN` | TikTok OAuth2 Refresh Token (1 Year Expiry) |
| `TIKTOK_OPEN_ID` | TikTok Open ID for `@nanoscie` |
| `TELEGRAM_BOT_TOKEN` | Bot API Token from `@BotFather` |
| `TELEGRAM_CHANNEL_QUEUE_ID` | Telegram Channel 1 ID (`FB Reels to Post`) |
| `TG_CHANNEL_BIOLOGY_ID` ... `_ROCKETS_ID` | 10 Telegram Category Archive Channels |
| `SUPABASE_URL` | Supabase Project URL (`https://xyz.supabase.co`) |
| `SUPABASE_KEY` | Supabase Service Role Key |
| `PORT` | Webhook HTTP Server Port (Default: `3000` / `8080`) |
| `FB_VERIFY_TOKEN` | Webhook Secret Verification Token |

---

## 🚀 Deployment & Local Execution

### Local Run
```bash
# 1. Install dependencies
npm install

# 2. Start the automation engine
npm start
```

---

## 📄 License
This project is licensed under the [MIT License](LICENSE).
