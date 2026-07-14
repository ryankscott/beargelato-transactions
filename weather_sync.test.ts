import { describe, it, expect, beforeAll } from "bun:test";
import { Database } from "bun:sqlite";
import {
  createWeatherSchema,
  saveWeatherDaily,
  fetchDailyWeather,
  type WeatherDaily,
  type WeatherConfig,
  type Fetcher,
} from "./lib/weather_sync.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const testConfig: WeatherConfig = {
  apiKey: "test-key",
  latitude: -36.8485,
  longitude: 174.7633,
  locationName: "Auckland CBD",
  initialStartDate: "2025-01-01",
};

// ---------------------------------------------------------------------------
// Database operations
// ---------------------------------------------------------------------------

describe("database operations", () => {
  let db: Database;

  beforeAll(() => {
    db = new Database(":memory:");
    createWeatherSchema(db);
  });

  it("creates the weather_daily table", () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain("weather_daily");
  });

  it("saves a weather row and retrieves it", () => {
    const rows: WeatherDaily[] = [
      {
        date: "2025-01-15",
        temp_high: 24.5,
        temp_low: 15.2,
        temp_avg: 19.8,
        rainfall_mm: 2.1,
        location_name: "Auckland CBD",
        latitude: -36.8485,
        longitude: 174.7633,
      },
    ];

    saveWeatherDaily(db, rows);

    const result = db
      .prepare("SELECT * FROM weather_daily WHERE date = ?")
      .get("2025-01-15") as Record<string, unknown>;

    expect(result).toBeTruthy();
    expect(result.temp_high).toBe(24.5);
    expect(result.temp_low).toBe(15.2);
    expect(result.temp_avg).toBe(19.8);
    expect(result.rainfall_mm).toBe(2.1);
  });

  it("upserts on duplicate date", () => {
    const rows: WeatherDaily[] = [
      {
        date: "2025-01-15",
        temp_high: 26.0,
        temp_low: 16.0,
        temp_avg: 21.0,
        rainfall_mm: 0.0,
        location_name: "Auckland CBD",
        latitude: -36.8485,
        longitude: 174.7633,
      },
    ];

    saveWeatherDaily(db, rows);

    const result = db
      .prepare("SELECT * FROM weather_daily WHERE date = ?")
      .get("2025-01-15") as Record<string, unknown>;

    expect(result.temp_high).toBe(26.0);
    expect(result.temp_low).toBe(16.0);
  });

  it("returns count of rows inserted/changed", () => {
    const rows: WeatherDaily[] = [
      {
        date: "2025-06-01",
        temp_high: 15.0,
        temp_low: 8.0,
        temp_avg: 11.5,
        rainfall_mm: 5.0,
        location_name: "Auckland CBD",
        latitude: -36.8485,
        longitude: 174.7633,
      },
      {
        date: "2025-06-02",
        temp_high: 17.0,
        temp_low: 10.0,
        temp_avg: 13.5,
        rainfall_mm: 0.0,
        location_name: "Auckland CBD",
        latitude: -36.8485,
        longitude: 174.7633,
      },
    ];

    const count = saveWeatherDaily(db, rows);
    expect(count).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

describe("fetchDailyWeather", () => {
  it("parses Open-Meteo API response", async () => {
    const mockFetch: Fetcher = async (url: string | URL | Request) => {
      // Simulate MetService failing → fallback to Open-Meteo
      if (String(url).includes("api.metservice.com")) {
        return new Response("Not Found", { status: 404 });
      }
      return new Response(
        JSON.stringify({
          daily: {
            time: ["2025-01-15", "2025-01-16"],
            temperature_2m_max: [24.5, 22.1],
            temperature_2m_min: [15.2, 13.8],
            temperature_2m_mean: [19.8, 17.9],
            precipitation_sum: [2.1, 0.0],
          },
        }),
        { status: 200 },
      );
    };

    const rows = await fetchDailyWeather(
      testConfig,
      mockFetch,
      "2025-01-01",
      "2025-01-31",
    );

    expect(rows.length).toBe(2);
    expect(rows[0].temp_avg).toBe(19.8);
    expect(rows[0].rainfall_mm).toBe(2.1);
    expect(rows[1].temp_high).toBe(22.1);
    expect(rows[1].rainfall_mm).toBe(0.0);
  });

  it("falls back to Open-Meteo when MetService returns 5xx", async () => {
    const mockFetch: Fetcher = async (url: string | URL | Request) => {
      if (String(url).includes("api.metservice.com")) {
        return new Response("Server Error", { status: 500 });
      }
      return new Response(
        JSON.stringify({
          daily: {
            time: ["2025-02-01"],
            temperature_2m_max: [20.0],
            temperature_2m_min: [12.0],
            temperature_2m_mean: [16.0],
            precipitation_sum: [0.5],
          },
        }),
        { status: 200 },
      );
    };

    const rows = await fetchDailyWeather(
      testConfig,
      mockFetch,
      "2025-02-01",
      "2025-02-28",
    );

    expect(rows.length).toBe(1);
    expect(rows[0].temp_avg).toBe(16.0);
  });

  it("throws on MetService auth error (no fallback)", async () => {
    const mockFetch: Fetcher = async (url: string | URL | Request) => {
      if (String(url).includes("api.metservice.com")) {
        return new Response('{"error":"unauthorized"}', {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("{}", { status: 200 });
    };

    expect(
      fetchDailyWeather(testConfig, mockFetch, "2025-01-01", "2025-01-02"),
    ).rejects.toThrow(/check METSERVICE_API_KEY/);
  });

  it("returns empty array when Open-Meteo has no daily data", async () => {
    const mockFetch: Fetcher = async (_url: string | URL | Request) => {
      return new Response(JSON.stringify({}), { status: 200 });
    };

    const rows = await fetchDailyWeather(
      testConfig,
      mockFetch,
      "2025-01-01",
      "2025-01-31",
    );

    expect(rows).toEqual([]);
  });

  it("throws when Open-Meteo also fails", async () => {
    const mockFetch: Fetcher = async (_url: string | URL | Request) => {
      return new Response("Bad Gateway", { status: 502 });
    };

    expect(
      fetchDailyWeather(testConfig, mockFetch, "2025-01-01", "2025-01-02"),
    ).rejects.toThrow(/Open-Meteo API error/);
  });
});
