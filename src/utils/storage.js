import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve(process.cwd(), "data");
const REPLIED_FILE = path.join(DATA_DIR, "replied_comments.json");

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Load set of already replied comment IDs from file.
 * @returns {Set<string>}
 */
export function getRepliedCommentIds() {
  try {
    if (fs.existsSync(REPLIED_FILE)) {
      const data = fs.readFileSync(REPLIED_FILE, "utf-8");
      const list = JSON.parse(data);
      return new Set(list);
    }
  } catch (err) {
    console.error("Error reading replied_comments.json:", err.message);
  }
  return new Set();
}

/**
 * Save a newly replied comment ID to local storage.
 * @param {string} commentId
 */
export function markCommentAsReplied(commentId) {
  try {
    const ids = getRepliedCommentIds();
    ids.add(commentId);
    fs.writeFileSync(REPLIED_FILE, JSON.stringify(Array.from(ids), null, 2));
  } catch (err) {
    console.error("Error saving to replied_comments.json:", err.message);
  }
}
