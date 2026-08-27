/**
 * Tool definition helper.
 *
 * Vendored from `@opencode-ai/plugin/v1`, which opencode stopped shipping
 * after beta-18286. The runtime behaviour is unchanged: `tool()` is an
 * identity function that exists purely to infer `execute`'s `args` from the
 * zod shape in `args`, and `tool.schema` is zod itself.
 *
 * Keeping it here lets the quota core drop its last dependency on the removed
 * V1 surface while leaving the tool payload byte-for-byte the same, so the V2
 * adapter in server.ts can keep handing `args` straight to `draft.add({ input })`.
 */

import { z } from "zod";

type AskInput = {
  permission: string;
  patterns: string[];
  always: string[];
  metadata: {
    [key: string]: any;
  };
};

export type ToolContext = {
  sessionID: string;
  messageID: string;
  agent: string;
  /**
   * Current project directory for this session.
   * Prefer this over process.cwd() when resolving relative paths.
   */
  directory: string;
  /**
   * Project worktree root for this session.
   * Useful for generating stable relative paths (e.g. path.relative(worktree, absPath)).
   */
  worktree: string;
  abort: AbortSignal;
  metadata(input: {
    title?: string;
    metadata?: {
      [key: string]: any;
    };
  }): void;
  ask(input: AskInput): Promise<void>;
};

export type ToolAttachment = {
  type: "file";
  mime: string;
  url: string;
  filename?: string;
};

export type ToolResult =
  | string
  | {
      title?: string;
      output: string;
      metadata?: {
        [key: string]: any;
      };
      attachments?: ToolAttachment[];
    };

type ToolInput<Args extends z.ZodRawShape> = {
  description: string;
  args: Args;
  execute(args: z.infer<z.ZodObject<Args>>, context: ToolContext): Promise<ToolResult>;
};

export function tool<Args extends z.ZodRawShape>(input: ToolInput<Args>): ToolInput<Args> {
  return input;
}

tool.schema = z;

export type ToolDefinition = ReturnType<typeof tool>;
