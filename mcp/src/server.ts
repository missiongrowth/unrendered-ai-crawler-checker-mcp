import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { analyzeUrl } from "./analyze";
import { checkBots } from "./bots";
import { summarizeAnalysis, summarizeBots } from "./summary";

const server = new McpServer({ name: "unrendered-mcp", version: "0.1.0" });
const input = { url: z.url({ protocol: /^https?$/ }).describe("Full http(s) URL of the page to analyse") };

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

async function respond(run: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return { content: [{ type: "text", text: JSON.stringify(await run()) }] };
  } catch (e) {
    return { content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }], isError: true };
  }
}

server.registerTool(
  "analyze_page",
  {
    title: "Compare raw HTML with rendered DOM",
    description:
      "Loads the URL in Chrome and compares what a crawler that does not run JavaScript receives (the raw HTML) with the rendered page, using the Unrendered extension's analysis. Returns the share of the main content present in the raw HTML, words only added by JavaScript, the text blocks missing from the raw HTML, head and JSON-LD field differences, challenge or error gates, and a not_checked list.",
    inputSchema: input,
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  ({ url }) =>
    respond(async () => {
      const result = await analyzeUrl(url);
      if (!result.ok) throw new Error(result.error);
      return summarizeAnalysis(url, result.snapshot, result.report);
    }),
);

server.registerTool(
  "check_ai_bots",
  {
    title: "Check AI bot access",
    description:
      "For each AI bot the extension knows (GPTBot, ClaudeBot, PerplexityBot and others), returns the robots.txt verdict for the URL and what the server answers when requested with that bot's published user-agent (same page, different page, blocked, challenged, redirected).",
    inputSchema: input,
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  ({ url }) => respond(async () => summarizeBots(url, await checkBots(url))),
);

await server.connect(new StdioServerTransport());
