import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  toPacificAucklandDate,
  metricsFor,
  createSchema,
  saveMedia,
  saveMediaMetrics,
  saveAccountMetrics,
  runSync,
  type InstagramConfig,
  type MediaItem,
} from "./lib/instagram_sync.ts";

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe("toPacificAucklandDate", () => {
  it("converts UTC midday to the next day in NZST", () => {
    // 2025-01-01T12:00:00Z = 2025-01-02T01:00:00+13:00 (NZDT summer)
    expect(toPacificAucklandDate("2025-01-01T12:00:00.000Z")).toBe("2025-01-02");
  });

  it("converts UTC midnight to the same day in NZST", () => {
    // 2025-01-01T00:00:00Z = 2025-01-01T13:00:00+13:00
    expect(toPacificAucklandDate("2025-01-01T00:00:00.000Z")).toBe("2025-01-01");
  });

  it("handles winter time offset", () => {
    // 2025-06-01T10:00:00Z = 2025-06-01T22:00:00+12:00
    expect(toPacificAucklandDate("2025-06-01T10:00:00.000Z")).toBe("2025-06-01");
  });
});

describe("metricsFor", () => {
  it("returns image metrics", () => {
    expect(metricsFor("IMAGE")).toContain("likes");
    expect(metricsFor("IMAGE")).toContain("reach");
  });

  it("returns reels metrics", () => {
    expect(metricsFor("REELS")).toContain("plays");
    expect(metricsFor("REELS")).toContain("likes");
  });

  it("returns story metrics", () => {
    expect(metricsFor("STORY")).toContain("reach");
    expect(metricsFor("STORY")).toContain("exits");
  });
});

// ---------------------------------------------------------------------------
// Database operations
// ---------------------------------------------------------------------------

describe("database operations", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    createSchema(db);
  });

  it("creates the expected tables", () => {
    const tables = db
      .query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'instagram_%'",
      )
      .all() as Array<{ name: string }>;
    const names = tables.map((t) => t.name).sort();
    expect(names).toEqual([
      "instagram_account_metrics",
      "instagram_media",
      "instagram_media_metrics",
    ]);
  });

  it("saves and updates media", () => {
    const item: MediaItem = {
      id: "123",
      media_type: "IMAGE",
      caption: "Hello world",
      permalink: "https://instagram.com/p/abc",
      timestamp: "2025-01-01T12:00:00.000Z",
      username: "beargelato",
    };

    saveMedia(db, item);
    let row = db
      .query("SELECT * FROM instagram_media WHERE media_id = ?")
      .get("123") as { caption: string; timestamp_local_date: string };
    expect(row.caption).toBe("Hello world");
    expect(row.timestamp_local_date).toBe("2025-01-02");

    saveMedia(db, { ...item, caption: "Updated" });
    row = db
      .query("SELECT * FROM instagram_media WHERE media_id = ?")
      .get("123") as { caption: string };
    expect(row.caption).toBe("Updated");
  });

  it("saves media metrics without duplication", () => {
    saveMedia(db, {
      id: "123",
      media_type: "IMAGE",
      timestamp: "2025-01-01T12:00:00.000Z",
    });

    saveMediaMetrics(db, "123", [{ name: "likes", values: [{ value: 42 }] }], "2025-01-02");
    saveMediaMetrics(db, "123", [{ name: "likes", values: [{ value: 50 }] }], "2025-01-02");

    const rows = db
      .query("SELECT metric_value FROM instagram_media_metrics WHERE metric_name = 'likes'")
      .all() as Array<{ metric_value: number }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].metric_value).toBe(50);
  });

  it("saves account metrics with local date conversion", () => {
    // Instagram day boundaries are at 07:00 UTC. In Pacific/Auckland that is
    // 19:00/20:00 on the same calendar day, so the metric maps to 2025-01-01.
    saveAccountMetrics(db, [
      { name: "impressions", value: 1000, endTime: "2025-01-01T07:00:00+0000" },
      { name: "reach", value: 500, endTime: "2025-01-01T07:00:00+0000" },
    ]);

    const rows = db
      .query("SELECT metric_name, metric_value, measured_at FROM instagram_account_metrics ORDER BY metric_name")
      .all() as Array<{ metric_name: string; metric_value: number; measured_at: string }>;
    expect(rows).toHaveLength(2);
    expect(rows[0].measured_at).toBe("2025-01-01");
    expect(rows[1].measured_at).toBe("2025-01-01");
  });
});

// ---------------------------------------------------------------------------
// End-to-end sync with mocked fetch
// ---------------------------------------------------------------------------

describe("runSync", () => {
  let db: Database;
  const config: InstagramConfig = {
    accessToken: "test-token",
    userId: "ig-user-123",
    initialStartDate: "2025-01-01T00:00:00.000Z",
  };

  function makeMockFetch(media: MediaItem[], story: MediaItem[] = []) {
    return async (url: string) => {
      const parsed = new URL(url);
      const path = parsed.pathname;

      if (path.endsWith("/media")) {
        return new Response(
          JSON.stringify({
            data: media,
            paging: {},
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      if (path.endsWith("/stories")) {
        return new Response(
          JSON.stringify({ data: story }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      if (path.includes("/insights")) {
        const metric = parsed.searchParams.get("metric") ?? "";
        const metricType = parsed.searchParams.get("metric_type") ?? "";
        // Handle total_value format (profile_views)
        if (metricType === "total_value") {
          return new Response(
            JSON.stringify({
              data: metric.split(",").map((name) => ({
                name,
                total_value: { value: 100 },
              })),
            }),
            { headers: { "Content-Type": "application/json" } },
          );
        }
        // Handle values[] format (media insights + reach)
        return new Response(
          JSON.stringify({
            data: metric.split(",").map((name) => ({
              name,
              period: "day",
              values: [{ value: 10, end_time: "2025-01-02T07:00:00+0000" }],
            })),
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response(JSON.stringify({ data: [] }), {
        headers: { "Content-Type": "application/json" },
      });
    };
  }

  beforeEach(() => {
    db = new Database(":memory:");
  });

  it("syncs media, stories, and account metrics", async () => {
    const media: MediaItem[] = [
      {
        id: "media-1",
        media_type: "IMAGE",
        caption: "Post 1",
        timestamp: "2025-01-01T12:00:00.000Z",
      },
    ];
    const stories: MediaItem[] = [
      {
        id: "story-1",
        media_type: "IMAGE",
        timestamp: "2025-01-01T12:00:00.000Z",
      },
    ];

    await runSync(db, config, makeMockFetch(media, stories));

    const mediaRows = db
      .query("SELECT media_id, media_type FROM instagram_media ORDER BY media_id")
      .all() as Array<{ media_id: string; media_type: string }>;
    expect(mediaRows).toHaveLength(2);
    expect(mediaRows[0].media_type).toBe("IMAGE");
    expect(mediaRows[1].media_type).toBe("STORY");

    const mediaMetricRows = db
      .query("SELECT COUNT(*) AS c FROM instagram_media_metrics")
      .get() as { c: number };
    expect(mediaMetricRows.c).toBeGreaterThan(0);

    const accountMetricRows = db
      .query("SELECT COUNT(*) AS c FROM instagram_account_metrics")
      .get() as { c: number };
    expect(accountMetricRows.c).toBeGreaterThan(0);

    const syncState = db
      .query("SELECT value FROM sync_state WHERE key = 'instagram_last_media_sync'")
      .get() as { value: string };
    expect(syncState.value).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("updates sync state after running", async () => {
    await runSync(
      db,
      config,
      makeMockFetch([
        {
          id: "media-2",
          media_type: "REELS",
          timestamp: "2025-01-01T12:00:00.000Z",
        },
      ]),
    );

    const lastAccount = db
      .query("SELECT value FROM sync_state WHERE key = 'instagram_last_account_sync'")
      .get() as { value: string };
    expect(lastAccount.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
