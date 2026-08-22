import axios from "axios";

/**
 * Fetch Mobile Legends hero head image from openmlbb API.
 * @param {string} heroName
 * @returns {Promise<string|null>}
 */
export async function getHeroImage(heroName) {
  if (!heroName) return null;

  try {
    const encodedName = encodeURIComponent(heroName);
    const res = await axios.get(`https://openmlbb.fastapicloud.dev/api/heroes/${encodedName}`);
    const headBig = res.data?.data?.records?.[0]?.data?.head_big;
    return headBig || null;
  } catch (err) {
    console.error("Could not fetch hero image:", err.message);
    return null;
  }
}
