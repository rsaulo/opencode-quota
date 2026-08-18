import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  config: vi.fn(),
  dispose: vi.fn(),
  event: vi.fn(),
  toolAfter: vi.fn(),
  quotaExecute: vi.fn(async () => "quota output"),
  resolveRuntime: vi.fn(async () => ({ runtime: true })),
  refreshExport: vi.fn(async () => true),
}));

vi.mock("../src/plugin.js", () => ({
  QuotaToastPlugin: vi.fn(async () => ({
    config: mocks.config.mockImplementation(async (config) => {
      config.command = { quota: { template: "/quota", description: "Quota" } };
    }),
    dispose: mocks.dispose,
    event: mocks.event,
    "tool.execute.after": mocks.toolAfter,
    tool: {
      quota_status: {
        description: "Quota status",
        args: {},
        execute: mocks.quotaExecute,
      },
    },
  })),
}));

vi.mock("../src/lib/quota-runtime-context.js", () => ({
  resolveQuotaRuntimeContext: mocks.resolveRuntime,
}));

vi.mock("../src/lib/quota-export-refresh.js", () => ({
  refreshQuotaExportIfEnabled: mocks.refreshExport,
}));

describe("V2 server adapter", () => {
  it("registers commands, tools, hooks, events, and cleanup", async () => {
    const disposers = [vi.fn(), vi.fn(), vi.fn()];
    let commandTransform: ((draft: unknown) => void) | undefined;
    let toolTransform: ((draft: unknown) => void) | undefined;
    let toolHook: ((input: unknown) => Promise<void>) | undefined;
    let eventYielded = false;
    const context = {
      catalog: { provider: { list: vi.fn(async () => ({ data: [] })) } },
      command: {
        transform: vi.fn(async (transform) => {
          commandTransform = transform;
          return { dispose: disposers[0] };
        }),
      },
      tool: {
        transform: vi.fn(async (transform) => {
          toolTransform = transform;
          return { dispose: disposers[1] };
        }),
        hook: vi.fn(async (_name, hook) => {
          toolHook = hook;
          return { dispose: disposers[2] };
        }),
      },
      session: { get: vi.fn(), synthetic: vi.fn() },
      event: {
        subscribe: vi.fn(async function* () {
          eventYielded = true;
          yield { type: "session.idle", data: { sessionID: "session-1" } };
        }),
      },
    };

    const plugin = (await import("../src/server.js")).default;
    const cleanup = await plugin.setup(context as never);
    const commands = new Map<string, Record<string, unknown>>();
    commandTransform?.({
      update(name: string, update: (command: Record<string, unknown>) => void) {
        const command = { name };
        update(command);
        commands.set(name, command);
      },
    });
    let registeredTool: { execute(input: unknown, context: unknown): Promise<unknown> } | undefined;
    toolTransform?.({
      add(tool: typeof registeredTool) {
        registeredTool = tool;
      },
    });

    expect(commands.size).toBeGreaterThan(1);
    expect(commands.get("quota")).toMatchObject({ template: "/quota" });
    await expect(
      registeredTool?.execute({}, { sessionID: "session-1", messageID: "m", agent: "a" }),
    ).resolves.toEqual({ content: "quota output" });
    await toolHook?.({
      status: "completed",
      tool: "question",
      sessionID: "session-1",
      id: "call-1",
      input: {},
      result: { content: "answer", metadata: {} },
    });
    await vi.waitFor(() => expect(eventYielded).toBe(true));
    await vi.waitFor(() => expect(mocks.refreshExport).toHaveBeenCalledWith({ runtime: true }));
    await vi.waitFor(() =>
      expect(mocks.event).toHaveBeenCalledWith({
        event: { type: "session.idle", properties: { sessionID: "session-1" } },
      }),
    );

    await cleanup?.();
    expect(mocks.toolAfter).toHaveBeenCalled();
    expect(mocks.dispose).toHaveBeenCalled();
    expect(disposers.every((dispose) => dispose.mock.calls.length === 1)).toBe(true);
  });
});
