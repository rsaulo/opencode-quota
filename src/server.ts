import { Plugin } from "@opencode-ai/plugin";
import { findGitWorktreeRoot, getEffectiveConfigRoot } from "./lib/config-file-utils.js";
import { QUOTA_DIALOG_COMMANDS } from "./lib/quota-dialog-commands.js";
import { refreshQuotaExportIfEnabled } from "./lib/quota-export-refresh.js";
import { resolveQuotaRuntimeContext } from "./lib/quota-runtime-context.js";
import { QuotaToastPlugin } from "./plugin.js";

const EXPORT_REFRESH_INTERVAL_MS = 60_000;

export default Plugin.define({
  id: "@slkiser/opencode-quota",
  async setup(context) {
    const registrations: Array<{ dispose(): Promise<void> }> = [];
    const directory = process.cwd();
    const legacyClient = {
      config: {
        get: async () => ({ data: {} }),
        providers: async () => {
          const result = await context.catalog.provider.list();
          return { data: { providers: result.data } };
        },
      },
      session: {
        get: async ({ path }: { path: { id: string } }) => ({
          data: await context.session.get({ sessionID: path.id }),
        }),
        prompt: async ({
          path,
          body,
        }: {
          path: { id: string };
          body: { parts: Array<{ text: string }> };
        }) =>
          context.session.synthetic({
            sessionID: path.id,
            text: body.parts.map((part) => part.text).join("\n"),
            description: "OpenCode Quota",
            resume: false,
          }),
      },
      // Server plugins cannot address the TUI directly in V2. The TUI entry
      // subscribes to the same events and owns visual quota notifications.
      tui: { showToast: async () => undefined },
      app: {
        log: async ({ body }: { body: { level: string; message: string; extra?: unknown } }) => {
          if (body.level === "warn" || body.level === "error") {
            console.warn(`[opencode-quota] ${body.message}`, body.extra ?? "");
          }
        },
      },
    };

    const hooks = await QuotaToastPlugin({
      client: legacyClient as never,
      directory,
    } as never);
    const workspaceRoot = findGitWorktreeRoot(directory) ?? directory;
    const refreshExport = async () => {
      const runtime = await resolveQuotaRuntimeContext({
        client: legacyClient as never,
        roots: {
          workspaceRoot,
          configRoot: getEffectiveConfigRoot(workspaceRoot),
          fallbackDirectory: directory,
        },
        configureTelemetry: false,
      });
      await refreshQuotaExportIfEnabled(runtime);
    };
    const refreshExportSafely = () =>
      void refreshExport().catch((error) => {
        console.warn(`[opencode-quota] quota export refresh failed: ${String(error)}`);
      });
    refreshExportSafely();
    const exportRefreshInterval = setInterval(refreshExportSafely, EXPORT_REFRESH_INTERVAL_MS);
    exportRefreshInterval.unref();

    const legacyConfig: {
      command?: Record<string, { template: string; description: string }>;
    } = {};
    await hooks.config?.(legacyConfig as never);
    registrations.push(
      await context.command.transform((draft) => {
        for (const spec of QUOTA_DIALOG_COMMANDS) {
          draft.update(spec.id, (command) => {
            command.template = legacyConfig.command?.[spec.id]?.template ?? `/${spec.slashName}`;
            command.description = spec.description;
          });
        }
      }),
    );

    if (hooks.tool?.quota_status) {
      const quotaStatus = hooks.tool.quota_status;
      registrations.push(
        await context.tool.transform((draft) => {
          draft.add({
            name: "quota_status",
            description: quotaStatus.description,
            input: quotaStatus.args,
            async execute(input, toolContext) {
              const result = await quotaStatus.execute(input as Record<string, unknown>, {
                sessionID: toolContext.sessionID,
                messageID: toolContext.messageID,
                agent: toolContext.agent,
                directory,
                worktree: directory,
                abort: new AbortController().signal,
                metadata: () => {},
                ask: async () => {},
              });
              return typeof result === "string"
                ? { content: result }
                : { content: result.output, metadata: result.metadata };
            },
          });
        }),
      );
    }

    if (hooks["tool.execute.after"]) {
      registrations.push(
        await context.tool.hook("execute.after", async (input) => {
          if (input.status !== "completed") return;
          await hooks["tool.execute.after"]?.(
            {
              tool: input.tool,
              sessionID: input.sessionID,
              callID: input.id,
              args: input.input,
            },
            {
              title: "",
              output: typeof input.result.content === "string" ? input.result.content : "",
              metadata: input.result.metadata,
            },
          );
        }),
      );
    }

    const abort = new AbortController();
    if (hooks.event) {
      void (async () => {
        try {
          for await (const event of context.event.subscribe({ signal: abort.signal })) {
            const data =
              "data" in event && event.data && typeof event.data === "object" ? event.data : {};
            await hooks.event?.({
              event: {
                type: event.type,
                properties: data,
              } as never,
            });
          }
        } catch (error) {
          if (!abort.signal.aborted) throw error;
        }
      })();
    }

    return async () => {
      clearInterval(exportRefreshInterval);
      abort.abort();
      await hooks.dispose?.();
      await Promise.all(registrations.map((registration) => registration.dispose()));
    };
  },
});
