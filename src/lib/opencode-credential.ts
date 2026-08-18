import { openOpenCodeSqliteReadOnly } from "./opencode-sqlite.js";
import { getOpenCodeDbPathCandidates } from "./opencode-storage.js";

const DEFAULT_CREDENTIAL_CACHE_MAX_AGE_MS = 5_000;

type CredentialRow = {
  value: string;
};

type CredentialCacheEntry = {
  timestamp: number;
  value: Record<string, unknown> | null;
};

const credentialCache = new Map<string, CredentialCacheEntry>();

function parseCredentialValue(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Read the newest OpenCode V2 credential without modifying the credential store. */
export async function readOpenCodeCredential(
  integrationId: string,
): Promise<Record<string, unknown> | null> {
  for (const dbPath of getOpenCodeDbPathCandidates()) {
    let db: Awaited<ReturnType<typeof openOpenCodeSqliteReadOnly>> | null = null;
    try {
      db = await openOpenCodeSqliteReadOnly(dbPath);
      const row = db.get<CredentialRow>(
        `SELECT value
         FROM credential
         WHERE integration_id = ?
         ORDER BY CASE WHEN active = 1 THEN 0 ELSE 1 END, time_updated DESC
         LIMIT 1`,
        [integrationId],
      );
      return row ? parseCredentialValue(row.value) : null;
    } catch {
      // Try alternate OpenCode data locations, including legacy macOS paths.
    } finally {
      db?.close();
    }
  }

  return null;
}

export async function readOpenCodeCredentialCached(
  integrationId: string,
  params?: { maxAgeMs?: number },
): Promise<Record<string, unknown> | null> {
  const maxAgeMs = Math.max(0, params?.maxAgeMs ?? DEFAULT_CREDENTIAL_CACHE_MAX_AGE_MS);
  const cached = credentialCache.get(integrationId);
  if (cached && Date.now() - cached.timestamp <= maxAgeMs) return cached.value;

  const value = await readOpenCodeCredential(integrationId);
  credentialCache.set(integrationId, { timestamp: Date.now(), value });
  return value;
}

export function clearOpenCodeCredentialCacheForTests(): void {
  credentialCache.clear();
}
