import fs from "node:fs/promises";
import path from "node:path";

export type GoogleTokenRecord = {
  userId: string;
  access_token: string;
  refresh_token: string;
  expiry_date: number;
  scope: string;
  token_type: string;
  updatedAt: string;
};

type TokenDatabase = {
  googleTokens: Record<string, GoogleTokenRecord>;
};

const DEFAULT_DB_PATH = process.env.NODE_ENV === "production" ? "/tmp/seo-reporter-google-tokens.json" : path.join(process.cwd(), ".data", "google-tokens.json");

function getDbPath(): string {
  return process.env.GOOGLE_TOKEN_DB_PATH || DEFAULT_DB_PATH;
}

async function readDatabase(): Promise<TokenDatabase> {
  try {
    const raw = await fs.readFile(getDbPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<TokenDatabase>;
    return { googleTokens: parsed.googleTokens ?? {} };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { googleTokens: {} };
    }
    throw error;
  }
}

async function writeDatabase(database: TokenDatabase): Promise<void> {
  const dbPath = getDbPath();
  await fs.mkdir(path.dirname(dbPath), { recursive: true });
  await fs.writeFile(dbPath, JSON.stringify(database, null, 2), "utf8");
}

export async function getGoogleTokenForUser(userId: string): Promise<GoogleTokenRecord | null> {
  const database = await readDatabase();
  return database.googleTokens[userId] ?? null;
}

export async function hasGoogleTokenForUser(userId: string): Promise<boolean> {
  return Boolean(await getGoogleTokenForUser(userId));
}

export async function upsertGoogleTokenForUser(userId: string, token: Omit<GoogleTokenRecord, "userId" | "updatedAt">): Promise<GoogleTokenRecord> {
  const database = await readDatabase();
  const record: GoogleTokenRecord = {
    userId,
    ...token,
    updatedAt: new Date().toISOString(),
  };
  database.googleTokens[userId] = record;
  await writeDatabase(database);
  return record;
}

export async function updateGoogleTokenForUser(userId: string, updates: Partial<Omit<GoogleTokenRecord, "userId" | "refresh_token">> & { refresh_token?: string }): Promise<GoogleTokenRecord> {
  const database = await readDatabase();
  const existing = database.googleTokens[userId];
  if (!existing) {
    throw new Error("Google Search Console is not connected for this user.");
  }

  const record: GoogleTokenRecord = {
    ...existing,
    ...updates,
    refresh_token: updates.refresh_token || existing.refresh_token,
    updatedAt: new Date().toISOString(),
  };
  database.googleTokens[userId] = record;
  await writeDatabase(database);
  return record;
}
