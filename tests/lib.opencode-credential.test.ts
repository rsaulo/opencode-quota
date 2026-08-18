import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getOpenCodeDbPathCandidates: vi.fn(),
  openOpenCodeSqliteReadOnly: vi.fn(),
}));

vi.mock("../src/lib/opencode-storage.js", () => ({
  getOpenCodeDbPathCandidates: mocks.getOpenCodeDbPathCandidates,
}));

vi.mock("../src/lib/opencode-sqlite.js", () => ({
  openOpenCodeSqliteReadOnly: mocks.openOpenCodeSqliteReadOnly,
}));

import {
  clearOpenCodeCredentialCacheForTests,
  readOpenCodeCredential,
  readOpenCodeCredentialCached,
} from "../src/lib/opencode-credential.js";

describe("OpenCode V2 credential reader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearOpenCodeCredentialCacheForTests();
    mocks.getOpenCodeDbPathCandidates.mockReturnValue(["/tmp/opencode.db"]);
  });

  it("reads the newest matching credential from SQLite in read-only mode", async () => {
    const close = vi.fn();
    const get = vi.fn().mockReturnValue({
      value: JSON.stringify({ type: "oauth", access: "token-1" }),
    });
    mocks.openOpenCodeSqliteReadOnly.mockResolvedValue({ get, all: vi.fn(), close });

    await expect(readOpenCodeCredential("xai")).resolves.toEqual({
      type: "oauth",
      access: "token-1",
    });
    expect(get).toHaveBeenCalledWith(expect.stringContaining("FROM credential"), ["xai"]);
    expect(close).toHaveBeenCalledOnce();
  });

  it("caches credential reads briefly", async () => {
    const get = vi.fn().mockReturnValue({ value: JSON.stringify({ type: "oauth" }) });
    mocks.openOpenCodeSqliteReadOnly.mockResolvedValue({ get, all: vi.fn(), close: vi.fn() });

    await readOpenCodeCredentialCached("xai");
    await readOpenCodeCredentialCached("xai");

    expect(mocks.openOpenCodeSqliteReadOnly).toHaveBeenCalledOnce();
  });

  it("returns null for malformed stored credentials", async () => {
    mocks.openOpenCodeSqliteReadOnly.mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: "not-json" }),
      all: vi.fn(),
      close: vi.fn(),
    });

    await expect(readOpenCodeCredential("xai")).resolves.toBeNull();
  });
});
