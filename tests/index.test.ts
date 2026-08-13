import { beforeEach, describe, expect, it, vi } from "vitest";

const pluginMocks = vi.hoisted(() => ({
  QuotaToastPlugin: vi.fn(),
  plugin: { id: "@slkiser/opencode-quota", setup: vi.fn() },
}));

vi.mock("../src/server.js", () => ({
  default: pluginMocks.plugin,
}));

vi.mock("../src/plugin.js", () => ({
  QuotaToastPlugin: pluginMocks.QuotaToastPlugin,
}));

describe("package entrypoint", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("exports the V2 plugin definition on the default export", async () => {
    const mod = await import("../src/index.js");

    expect(mod.default).toBe(pluginMocks.plugin);
    expect(mod.QuotaToastPlugin).toBe(pluginMocks.QuotaToastPlugin);
    expect(mod.QUOTA_PROVIDER_REMOTE_FORMATS).toEqual(["quota-v1", "openrouter-key-v1", "json-v1"]);
    expect(JSON.stringify(mod.QUOTA_PROVIDER_REMOTE_FORMATS)).not.toContain(
      ["accounting", "v1"].join("-"),
    );
  });
});
