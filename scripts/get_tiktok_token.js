import "dotenv/config";
import axios from "axios";
import readline from "readline";

const clientKey = process.env.TIKTOK_CLIENT_KEY || "sbawqqrzegv94fwpwv";
const clientSecret = process.env.TIKTOK_CLIENT_SECRET || "3U6xgl1xcMXvCyLwQP3SKnoPs6tmBPTa";
const redirectUri = "https://nanofacts-automation.netlify.app/";

const scope = "user.info.basic,user.info.profile,video.upload,video.publish";

// Generate TikTok Sandbox Authorization URL
const authUrl = `https://www.tiktok.com/v2/auth/authorize/?client_key=${clientKey}&scope=${encodeURIComponent(scope)}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&state=tiktok_sandbox_auth`;

console.log("==================================================================");
console.log("[INFO] TIKTOK SANDBOX OAUTH2 AUTHORIZATION HELPER");
console.log("==================================================================");
console.log("\n1. Open this URL in your browser (logged in as @nanoscie):\n");
console.log(authUrl);
console.log("\n------------------------------------------------------------------");
console.log("2. Click 'Authorize' or 'Allow' on the TikTok page.");
console.log("3. After authorizing, you will be redirected to https://nanofacts-automation.netlify.app/?code=XXXXXX&scopes=...");
console.log("4. Copy the full URL from address bar and paste below.\n");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question("Paste redirected URL or code here: ", async (input) => {
  rl.close();

  let code = input.trim();
  if (code.includes("code=")) {
    const urlParams = new URL(code.startsWith("http") ? code : `https://dummy.com/${code}`).searchParams;
    code = urlParams.get("code") || code;
  }

  console.log(`\nExchanging code "${code.slice(0, 8)}..." for permanent Tokens...`);

  try {
    const res = await axios.post(
      "https://open.tiktokapis.com/v2/oauth/token/",
      new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        code: code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Cache-Control": "no-cache",
        },
      }
    );

    const data = res.data?.data || res.data;

    if (!data.access_token && !data.refresh_token) {
      console.error("[ERROR] Failed to retrieve tokens:", res.data);
      return;
    }

    console.log("\n==================================================================");
    console.log("[SUCCESS] TIKTOK AUTHENTICATION SUCCESSFUL");
    console.log("==================================================================");
    console.log(`Open ID:        ${data.open_id}`);
    console.log(`Access Token:   ${data.access_token?.slice(0, 15)}... (Expires in ${data.expires_in}s)`);
    console.log(`Refresh Token:  ${data.refresh_token}`);
    console.log("==================================================================\n");

    console.log("Copy these credentials to your .env file:\n");
    console.log(`TIKTOK_CLIENT_KEY="${clientKey}"`);
    console.log(`TIKTOK_CLIENT_SECRET="${clientSecret}"`);
    console.log(`TIKTOK_REFRESH_TOKEN="${data.refresh_token}"`);
    console.log(`TIKTOK_OPEN_ID="${data.open_id}"\n`);
  } catch (err) {
    console.error("[ERROR] Token exchange error:", err.response?.data || err.message);
  }
});
