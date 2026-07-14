import { Database } from "bun:sqlite";
import { runSync, type InstagramConfig } from "./lib/instagram_sync.ts";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN;
const USER_ID = process.env.INSTAGRAM_USER_ID;
const INITIAL_START_DATE =
  process.env.INSTAGRAM_INITIAL_START_DATE ?? "2025-01-01T00:00:00.000Z";
const DB_PATH = process.env.DB_PATH ?? "transactions.db";

if (!ACCESS_TOKEN || !USER_ID) {
  console.error(
    "Error: INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_USER_ID must be set in .env",
  );
  console.error("See docs/INSTAGRAM_SETUP.md for setup instructions.");
  process.exit(1);
}

const config: InstagramConfig = {
  accessToken: ACCESS_TOKEN,
  userId: USER_ID,
  appId: process.env.INSTAGRAM_APP_ID,
  appSecret: process.env.INSTAGRAM_APP_SECRET,
  pageId: process.env.INSTAGRAM_PAGE_ID,
  initialStartDate: INITIAL_START_DATE,
};

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const db = new Database(DB_PATH);

runSync(db, config)
  .then(() => {
    db.close();
  })
  .catch((err) => {
    console.error(`\nInstagram sync failed: ${err}`);
    db.close();
    process.exit(1);
  });
