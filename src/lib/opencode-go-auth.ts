import type { InvalidAwareAuthDiagnostics, InvalidAwareAuthResult } from "./api-key-resolver.js";
import {
  createProviderApiKeyResolver,
  getGlobalOpencodeConfigCandidatePaths,
} from "./api-key-resolver.js";
import { getAuthPaths, readAuthFileCached } from "./opencode-auth.js";
import { readOpenCodeCredentialCached } from "./opencode-credential.js";

export const DEFAULT_OPENCODE_GO_AUTH_CACHE_MAX_AGE_MS = 5_000;
// OpenCode V2 stores the credential under "opencode-go"; V1 used "opencode".
const OPENCODE_GO_AUTH_KEYS = ["opencode-go", "opencode"] as const;
const OPENCODE_GO_PROVIDER_KEYS = ["opencode-go", "opencode"] as const;
const ALLOWED_OPENCODE_GO_ENV_VARS = ["OPENCODE_API_KEY"] as const;

export type OpenCodeGoKeySource =
  | "env:OPENCODE_API_KEY"
  | "opencode.json"
  | "opencode.jsonc"
  | "auth.json";

export type ResolvedOpenCodeGoAuth = InvalidAwareAuthResult;
export type OpenCodeGoAuthDiagnostics = InvalidAwareAuthDiagnostics<
  OpenCodeGoKeySource,
  "auth.json"
>;

export { getGlobalOpencodeConfigCandidatePaths as getOpencodeConfigCandidatePaths } from "./api-key-resolver.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** True when the V2 credential is an API entry the resolver can actually use. */
function isUsableApiCredential(value: unknown): boolean {
  return (
    isRecord(value) &&
    value.type === "api" &&
    typeof value.key === "string" &&
    value.key.trim().length > 0
  );
}

/**
 * Auth sources for OpenCode Go, newest first.
 *
 * OpenCode V2 writes this key to the `credential` table and no longer keeps
 * auth.json in step -- it already dropped the xAI entry from that file, which
 * is what 0bd0ee7 had to work around. Preferring the credential store keeps a
 * stale auth.json from shadowing a freshly rotated key.
 *
 * The override is applied only when the credential is a usable API entry, so
 * every path that resolved before still resolves: a missing or malformed
 * credential leaves auth.json's own "opencode-go" and legacy "opencode" entries
 * exactly where the resolver expects to find them.
 */
async function readOpenCodeGoAuthSources(maxAgeMs: number): Promise<unknown | null> {
  const auth = await readAuthFileCached({ maxAgeMs });
  const credential = await readOpenCodeCredentialCached("opencode-go", { maxAgeMs });
  if (!isUsableApiCredential(credential)) return auth;
  return { ...(isRecord(auth) ? auth : {}), "opencode-go": credential };
}

const openCodeGoAuthResolver = createProviderApiKeyResolver<OpenCodeGoKeySource, "auth.json">({
  envVars: [{ name: "OPENCODE_API_KEY", source: "env:OPENCODE_API_KEY" }],
  providerKeys: OPENCODE_GO_PROVIDER_KEYS,
  allowedEnvVars: ALLOWED_OPENCODE_GO_ENV_VARS,
  configJsonSource: "opencode.json",
  configJsoncSource: "opencode.jsonc",
  getConfigCandidates: getGlobalOpencodeConfigCandidatePaths,
  auth: {
    policy: "invalid-aware-api-key",
    authKeys: OPENCODE_GO_AUTH_KEYS,
    authSource: "auth.json",
    displayName: "OpenCode Go",
    defaultMaxAgeMs: DEFAULT_OPENCODE_GO_AUTH_CACHE_MAX_AGE_MS,
    unsupportedTypeError: "OpenCode Go auth entry has unsupported type",
    readAuth: (maxAgeMs) => readOpenCodeGoAuthSources(maxAgeMs),
    getAuthPaths,
  },
});

export function resolveOpenCodeGoAuth(auth: unknown): ResolvedOpenCodeGoAuth {
  return openCodeGoAuthResolver.parseAuth(auth);
}

export async function resolveOpenCodeGoAuthCached(params?: {
  maxAgeMs?: number;
}): Promise<ResolvedOpenCodeGoAuth> {
  return openCodeGoAuthResolver.resolve(params);
}

export async function getOpenCodeGoAuthDiagnostics(params?: {
  maxAgeMs?: number;
}): Promise<OpenCodeGoAuthDiagnostics> {
  return openCodeGoAuthResolver.diagnostics(params);
}
