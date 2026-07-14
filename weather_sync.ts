// weather_sync.ts — Run: bun run sync:weather
import { Database } from "bun:sqlite";
import { runWeatherSync, type WeatherConfig } from "./lib/weather_sync.ts";

const API_KEY = process.env.METSERVICE_API_KEY;
if (!API_KEY) {
  console.error("❌ METSERVICE_API_KEY must be set in .env");
  process.exit(1);
}

const config: WeatherConfig = {
  apiKey: API_KEY,
  latitude: parseFloat(process.env.WEATHER_LAT ?? "-36.8485"),
  longitude: parseFloat(process.env.WEATHER_LON ?? "174.7633"),
  locationName: process.env.WEATHER_LOCATION ?? "Auckland CBD",
  initialStartDate: process.env.WEATHER_INITIAL_START ?? "2025-01-01",
};

const DB_PATH = process.env.DB_PATH ?? "transactions.db";
const db = new Database(DB_PATH);

try {
  const result = await runWeatherSync(db, config);
  console.log(
    `✅ Weather sync complete: ${result.inserted} rows inserted/updated.`,
  );
  console.log(`   Next sync will start from: ${result.nextSync}`);
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`❌ Weather sync failed: ${message}`);
  process.exit(1);
} finally {
  db.close();
}
