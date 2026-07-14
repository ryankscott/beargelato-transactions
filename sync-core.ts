import { Database } from 'bun:sqlite';

const USER_UUID = process.env.VERIFONE_USER_UUID;
const API_KEY = process.env.VERIFONE_API_KEY;
const NOTIFICATION_EMAIL = process.env.VERIFONE_NOTIFICATION_EMAIL ?? '';
const INITIAL_START_DATE = process.env.INITIAL_START_DATE ?? '2025-01-01T00:00:00.000Z';
const DB_PATH = process.env.DB_PATH ?? 'transactions.db';
const API_BASE = 'https://nz.gsc.verifone.cloud/oidc/report-engine/api/v1';

function getDb() {
  const db = new Database(DB_PATH);
  // Ensure tables exist
  db.run(`
    CREATE TABLE IF NOT EXISTS transactions (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      organisation          TEXT,
      created_at_date       TEXT,
      created_at_time       TEXT,
      created_at_timezone   TEXT,
      created_at_utc        TEXT,
      reference             TEXT,
      product               TEXT,
      orig_amount           REAL,
      orig_amount_currency  TEXT,
      curr_amount           REAL,
      curr_amount_currency  TEXT,
      type                  TEXT,
      status                TEXT,
      merchant_reference    TEXT,
      imported_at           TEXT DEFAULT (datetime('now'))
    )
  `);
  db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_txn_dedup
    ON transactions (created_at_utc, reference)
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS sync_state (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
  return db;
}

function generateMonthlyChunks(start: string, end: string): Array<{ from: string; to: string }> {
  const chunks: Array<{ from: string; to: string }> = [];
  let current = new Date(start);
  const endDate = new Date(end);

  while (current < endDate) {
    const chunkStart = current.toISOString();
    const next = new Date(current);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const chunkEnd = next >= endDate ? endDate : next;
    chunks.push({ from: chunkStart, to: chunkEnd.toISOString() });
    current = chunkEnd;
  }
  return chunks;
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function buildColMap(headers: string[]): Record<string, number> {
  function col(name: string): number {
    const idx = headers.indexOf(name);
    if (idx === -1) console.warn(`  Warning: expected CSV column "${name}" not found`);
    return idx;
  }
  return {
    organisation: col('organisation'),
    created_at_date: col('created_at_date'),
    created_at_time: col('created_at_time'),
    created_at_timezone: col('created_at_timezone'),
    created_at_utc: col('created_at_utc'),
    reference: col('reference'),
    product: col('product'),
    orig_amount: col('orig.amount'),
    orig_amount_currency: col('orig.amount currency code'),
    curr_amount: col('curr.amount'),
    curr_amount_currency: col('curr.amount currency code'),
    type: col('type'),
    status: col('status'),
    merchant_reference: col('merchant_reference'),
  };
}

function field(fields: string[], idx: number): string | null {
  if (idx === -1) return null;
  const val = fields[idx]?.trim();
  return val === '' || val === undefined ? null : val;
}

function numField(fields: string[], idx: number): number | null {
  const val = field(fields, idx);
  if (val === null) return null;
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

export async function runSync(): Promise<{ inserted: number; skipped: number; nextSync: string }> {
  if (!USER_UUID || !API_KEY) {
    throw new Error('VERIFONE_USER_UUID and VERIFONE_API_KEY must be set in .env');
  }

  const db = getDb();
  const stateRow = db.prepare("SELECT value FROM sync_state WHERE key = 'last_sync_time'").get() as { value: string } | undefined;
  const syncStart = stateRow?.value ?? INITIAL_START_DATE;
  const syncEnd = new Date().toISOString();
  const chunks = generateMonthlyChunks(syncStart, syncEnd);

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO transactions (
      organisation, created_at_date, created_at_time, created_at_timezone,
      created_at_utc, reference, product,
      orig_amount, orig_amount_currency,
      curr_amount, curr_amount_currency,
      type, status, merchant_reference
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertBatch = db.transaction(
    (dataLines: string[], COL: Record<string, number>) => {
      let inserted = 0;
      for (const line of dataLines) {
        const f = parseCSVLine(line);
        const result = insertStmt.run(
          field(f, COL.organisation),
          field(f, COL.created_at_date),
          field(f, COL.created_at_time),
          field(f, COL.created_at_timezone),
          field(f, COL.created_at_utc),
          field(f, COL.reference),
          field(f, COL.product),
          numField(f, COL.orig_amount),
          field(f, COL.orig_amount_currency),
          numField(f, COL.curr_amount),
          field(f, COL.curr_amount_currency),
          field(f, COL.type),
          field(f, COL.status),
          field(f, COL.merchant_reference),
        );
        inserted += result.changes;
      }
      return inserted;
    },
  );

  const credentials = Buffer.from(`${USER_UUID}:${API_KEY}`).toString('base64');

  let totalInserted = 0;
  let totalSkipped = 0;

  for (const { from, to } of chunks) {
    const body = {
      mode: 'INSTANT_REPORT',
      dateType: 'CREATED',
      reportStartTime: from,
      reportEndTime: to,
      convertToTimezone: 'Pacific/Auckland',
      reportName: 'custom',
      templateDetails: {
        templateType: 'STANDARD',
        template: 'SIMPLIFIED_TRANSACTIONS_GROUPED',
      },
      notificationEmails: NOTIFICATION_EMAIL ? [NOTIFICATION_EMAIL] : [],
      search: '(followOnTransaction==null)',
    };

    const response = await fetch(`${API_BASE}/reports/transactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/plain, */*',
        Authorization: `Basic ${credentials}`,
        CustomerUniqueId: '',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`API error ${response.status}: ${errBody}`);
    }

    const csvText = await response.text();
    const lines = csvText.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

    if (lines.length >= 2) {
      const COL = buildColMap(parseCSVLine(lines[0]).map((h) => h.toLowerCase().trim()));
      const dataLines = lines.slice(1);
      const inserted = insertBatch(dataLines, COL) as number;
      totalInserted += inserted;
      totalSkipped += dataLines.length - inserted;
    }
  }

  db.prepare("INSERT OR REPLACE INTO sync_state (key, value) VALUES ('last_sync_time', ?)").run(syncEnd);
  db.close();

  return { inserted: totalInserted, skipped: totalSkipped, nextSync: syncEnd };
}
