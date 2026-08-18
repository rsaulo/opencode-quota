import {
  buildQuotaExport,
  createExportProviderContext,
  resolveExportPath,
  writeQuotaExport,
} from "./quota-export.js";
import { resolveQuotaFormatStyle } from "./quota-format-style.js";
import { collectQuotaRenderData } from "./quota-render-data.js";
import {
  createQuotaRuntimeRequestContext,
  type QuotaRuntimeContext,
} from "./quota-runtime-context.js";

export async function refreshQuotaExportIfEnabled(runtime: QuotaRuntimeContext): Promise<boolean> {
  if (!runtime.config.enabled || !runtime.config.export.enabled) return false;

  const globalRuntime: QuotaRuntimeContext = {
    ...runtime,
    config: {
      ...runtime.config,
      onlyCurrentModel: false,
      showSessionTokens: false,
    },
    session: {},
  };

  await collectQuotaRenderData({
    client: globalRuntime.client,
    resolveRuntimeProviderIds: globalRuntime.resolveRuntimeProviderIds,
    config: globalRuntime.config,
    configMeta: globalRuntime.configMeta,
    request: createQuotaRuntimeRequestContext(globalRuntime),
    surfaceExplicitProviderIssues: true,
    formatStyle: resolveQuotaFormatStyle(globalRuntime.config.formatStyle),
    providers: globalRuntime.providers,
    includeAllWindowsData: true,
  });

  await writeQuotaExport(
    await buildQuotaExport({
      providers: globalRuntime.providers,
      ctx: createExportProviderContext(globalRuntime),
      ttlMs: globalRuntime.config.minIntervalMs,
      fromCache: true,
    }),
    resolveExportPath(globalRuntime.config.export.path),
  );
  return true;
}
