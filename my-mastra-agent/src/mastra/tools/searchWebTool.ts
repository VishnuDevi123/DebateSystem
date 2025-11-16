// src/tools/search-web-tool.ts
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

interface SerperResponse {
  organic: {
    title: string;
    link: string;
    snippet?: string;
  }[];
}

export const searchWebTool = createTool({
  id: "search-web",
  description: "Searches the web for factual information related to a claim.",
  inputSchema: z.object({
    query: z.string().describe("The text or claim to search for."),
    maxResults: z.number().default(3),
  }),
  outputSchema: z.object({
    results: z.array(
      z.object({
        title: z.string(),
        url: z.string().url(),
        snippet: z.string().optional(),
      })
    ),
  }),
  execute: async ({ context }) => {
    return await performSearch(context.query, context.maxResults);
  },
});

const performSearch = async (query: string, maxResults: number) => {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) throw new Error("Missing SERPER_API_KEY in .env");

  const response = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": apiKey,
    },
    body: JSON.stringify({ q: query, num: maxResults }),
  });

  if (!response.ok) throw new Error("Search API error");
  const data = (await response.json()) as SerperResponse;

  const results = (data.organic || []).slice(0, maxResults).map((r) => ({
    title: r.title,
    url: r.link,
    snippet: r.snippet ?? "",
  }));

  return { results };
};