import { gatewayFor, managedText, codePoints } from "./preview-gateway";
import type { PluginSettings } from "./types";

interface OpenAiTextContent {
  type: string;
  text?: string;
}

interface OpenAiOutputItem {
  type: string;
  content?: OpenAiTextContent[];
}

interface OpenAiResponse {
  output_text?: string;
  output?: OpenAiOutputItem[];
  choices?: Array<{ message?: { content?: string } }>;
  usage?: TokenUsage;
  error?: {
    message?: string;
  };
}

const OPENAI_REQUEST_TIMEOUT_MS = 120000;
const FULL_TEXT_CHUNK_CHAR_LIMIT = 48000;
const FULL_TEXT_HARD_CHUNK_CHAR_LIMIT = 90000;
const FULL_TEXT_CONTEXT_CHAR_LIMIT = 1600;
const SUSPICIOUS_OUTPUT_RATIO_LOW = 0.55;
const SUSPICIOUS_OUTPUT_RATIO_HIGH = 1.8;

export interface TokenUsage {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
}

export interface AiRequestUsage {
  provider: "openrouter";
  model: string;
  inputChars: number;
  outputChars: number;
  instructionChars: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface AiUsageSummary {
  requests: number;
  inputChars: number;
  outputChars: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

let activeUsageCollector: AiRequestUsage[] | null = null;

export async function collectAiUsageDuring<T>(work: () => Promise<T>): Promise<{ result: T; usage: AiUsageSummary }> {
  const previousCollector = activeUsageCollector;
  const requests: AiRequestUsage[] = [];
  activeUsageCollector = requests;
  try {
    const result = await work();
    return { result, usage: summarizeAiUsage(requests) };
  } finally {
    activeUsageCollector = previousCollector;
  }
}

export function summarizeAiUsage(requests: AiRequestUsage[]): AiUsageSummary {
  return requests.reduce<AiUsageSummary>((summary, request) => ({
    requests: summary.requests + 1,
    inputChars: summary.inputChars + request.inputChars,
    outputChars: summary.outputChars + request.outputChars,
    inputTokens: summary.inputTokens + request.inputTokens,
    outputTokens: summary.outputTokens + request.outputTokens,
    totalTokens: summary.totalTokens + request.totalTokens,
  }), {
    requests: 0,
    inputChars: 0,
    outputChars: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  });
}

export async function rewriteWithOpenAi(settings: PluginSettings, instruction: string, text: string, abortSignal?: AbortSignal): Promise<string> {
  return requestFullTextEdit(settings, [
    "You edit Markdown text.",
    "Return only the revised Markdown text.",
    "Do not wrap the result in code fences.",
    "Preserve links, headings, lists, frontmatter, code blocks, and existing Markdown syntax unless the user instruction explicitly asks you to change them.",
  ].join(" "), instruction, text, abortSignal, getLargeContentModelOverride(settings));
}

export async function highlightReadingKeywordsWithOpenAi(settings:PluginSettings,text:string,abortSignal?:AbortSignal):Promise<string>{
 if(abortSignal?.aborted)throw new Error("Operation cancelled.");return managedText(gatewayFor(settings),text,"highlight",{input_characters:codePoints(text)});
}
export async function generateSummaryFromContent(settings:PluginSettings,text:string,abortSignal?:AbortSignal):Promise<string>{
 if(abortSignal?.aborted)throw new Error("Operation cancelled.");const input=text;return managedText(gatewayFor(settings),input,"summarize",{input_characters:codePoints(input)}).then(s=>s.trim().replace(/\s+/g," "));
}
export async function generateDelimitedSummaryPrefix(settings:PluginSettings,text:string,abortSignal?:AbortSignal):Promise<string>{
 if(abortSignal?.aborted)throw new Error("Operation cancelled.");const input=text;return managedText(gatewayFor(settings),input,"summary-prefix",{input_characters:codePoints(input)}).then(s=>s.trim().replace(/\s+/g," ").replace(/:-:/g,"").trim());
}
export async function classifyFolderFromContent(settings:PluginSettings,folders:string[],text:string,abortSignal?:AbortSignal):Promise<string>{
 if(abortSignal?.aborted)throw new Error("Operation cancelled.");const folderList=folders.length?folders:["Jobs","Clients","DevOps","Finance"],input=text;const raw=await managedText(gatewayFor(settings),input,"classify",{input_characters:codePoints(input),allowed_folders:folderList});const normalized=sanitizeFolderName(raw);return folderList.find(folder=>folder.toLowerCase()===normalized.toLowerCase())||folderList[0];
}

export function buildThreePartSample(text: string, maxCharacters = 5000): string {
  if (text.length <= maxCharacters) {
    return text;
  }

  const markerBudget = 120;
  const partLength = Math.max(200, Math.floor((maxCharacters - markerBudget) / 3));
  const middleStart = Math.max(0, Math.floor((text.length - partLength) / 2));

  return [
    "[BEGINNING]",
    text.slice(0, partLength),
    "[MIDDLE]",
    text.slice(middleStart, middleStart + partLength),
    "[ENDING]",
    text.slice(-partLength),
  ].join("\n").slice(0, maxCharacters);
}

export function applySummary(text: string, summary: string): string {
  const cleanSummary = summary.trim();

  if (!cleanSummary) {
    return text;
  }

  const section = `## Summary\n\n${cleanSummary}`;
  const frontmatter = text.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/)?.[0] || "";
  const body = text.slice(frontmatter.length).replace(/^\s*\n/, "");
  if (/^## Summary\s*$/im.test(body)) {
    return frontmatter + body.replace(/^## Summary\s*\n+[\s\S]*?(?=\n#{1,6}\s|\s*$)/im, `${section}\n\n`);
  }
  return `${frontmatter}${frontmatter ? "\n" : ""}${section}\n\n${body.replace(/^\n+/, "")}`;
}

export function sanitizeFolderName(value: string): string {
  return value
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\\/g, "/")
    .split("/")
    .map((part) => part.trim().replace(/[<>:"|?*]/g, "").replace(/\s+/g, " "))
    .filter(Boolean)
    .join("/");
}

async function requestOpenAiText(settings: PluginSettings, instructions: string, input: string, modelOverride?: string, abortSignal?: AbortSignal): Promise<string> {
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  const timeout = window.setTimeout(() => controller.abort(), OPENAI_REQUEST_TIMEOUT_MS);
  if (abortSignal?.aborted) {
    controller.abort();
  } else {
    abortSignal?.addEventListener("abort", abortFromCaller, { once: true });
  }

  try {
    return requestOpenAiResponsesText(settings, instructions, input, modelOverride, controller.signal);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("OpenRouter request timed out.");
    }

    throw error;
  } finally {
    window.clearTimeout(timeout);
    abortSignal?.removeEventListener("abort", abortFromCaller);
  }
}

async function requestFullTextEdit(
  settings: PluginSettings,
  baseInstructions: string,
  userInstruction: string,
  text: string,
  abortSignal?: AbortSignal,
  modelOverride?: string,
  label = "TEXT TO EDIT",
): Promise<string> {
  if(abortSignal?.aborted)throw new Error("Operation cancelled.");
  // One immutable job: Constance chooses the bounded model and system prompt.
  return managedText(gatewayFor(settings),text,"transform",{input_characters:codePoints(text),instructions:userInstruction});
}

function buildChunkPrompt(userInstruction: string, label: string, chunk: string, index: number, total: number, previousContext: string, nextContext: string): string {
  return [
    userInstruction,
    previousContext ? `\nREAD-ONLY CONTEXT BEFORE CHUNK ${index}:\n${previousContext}` : "",
    `\n${label} CHUNK ${index} OF ${total}:\n${chunk}`,
    nextContext ? `\nREAD-ONLY CONTEXT AFTER CHUNK ${index}:\n${nextContext}` : "",
  ].filter(Boolean).join("\n");
}

export function splitTextForAi(text: string, limit: number): string[] {
  if (text.length <= limit) {
    return [text];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + limit, text.length);
    if (end < text.length) {
      const minimumBreak = start + Math.floor(limit * 0.45);
      const paragraphBreak = findLastBreak(text, "\n\n", start, end, minimumBreak);
      const lineBreak = findLastBreak(text, "\n", start, end, minimumBreak);

      if (paragraphBreak > 0) {
        end = paragraphBreak;
      } else if (lineBreak > 0) {
        end = lineBreak;
      } else {
        const hardEnd = Math.min(start + FULL_TEXT_HARD_CHUNK_CHAR_LIMIT, text.length);
        const lateLineBreak = findLastBreak(text, "\n", start, hardEnd, start + limit);
        if (lateLineBreak > 0) {
          end = lateLineBreak;
        } else if (hardEnd < text.length) {
          end = findLastSoftBreakInsideLongLine(text, start, hardEnd);
        } else {
          end = hardEnd;
        }
      }
    }
    chunks.push(text.slice(start, end));
    start = end;
  }

  return chunks;
}

function findLastBreak(text: string, marker: string, start: number, end: number, minimumBreak: number): number {
  const index = text.lastIndexOf(marker, end);
  return index >= minimumBreak && index >= start ? index + marker.length : -1;
}

function findLastSoftBreakInsideLongLine(text: string, start: number, end: number): number {
  const slice = text.slice(start, end);
  const match = [...slice.matchAll(/[ \t.,;:!?)]/g)].pop();
  return match?.index !== undefined && match.index > 0 ? start + match.index + 1 : end;
}

async function requestOpenAiResponsesText(settings: PluginSettings, instructions: string, input: string, modelOverride: string | undefined, signal: AbortSignal): Promise<string> {
  if(signal.aborted)throw new Error("Operation cancelled.");
  const output=await managedText(gatewayFor(settings),input,"transform",{input_characters:codePoints(input),instructions});
  if(signal.aborted)throw new Error("Operation cancelled after reveal; the same result is preserved without another charge.");
  recordAiUsage("openrouter","managed",input,instructions,output);
  return output;
}

function recordAiUsage(provider: "openrouter", model: string, input: string, instructions: string, output: string, usage?: TokenUsage): void {
  const inputTokens = usage?.input_tokens ?? usage?.prompt_tokens ?? 0;
  const outputTokens = usage?.output_tokens ?? usage?.completion_tokens ?? 0;
  const totalTokens = usage?.total_tokens ?? inputTokens + outputTokens;
  const outputRatio = input.length > 0 ? output.length / input.length : 1;

  if (input.length > 1000 && (outputRatio < SUSPICIOUS_OUTPUT_RATIO_LOW || outputRatio > SUSPICIOUS_OUTPUT_RATIO_HIGH)) {
    console.warn("[Torbert Text AI] Suspicious AI character delta", {
      provider,
      model,
      inputChars: input.length,
      outputChars: output.length,
      outputRatio: Number(outputRatio.toFixed(3)),
    });
  }

  activeUsageCollector?.push({
    provider,
    model,
    inputChars: input.length,
    outputChars: output.length,
    instructionChars: instructions.length,
    inputTokens,
    outputTokens,
    totalTokens,
  });
}

function estimateMaxCompletionTokens(input: string): number {
  return Math.min(32000, Math.max(2000, Math.ceil(input.length / 3) + 1000));
}

async function readOpenAiResponse(response: Response): Promise<OpenAiResponse> {
  try {
    return await response.json() as OpenAiResponse;
  } catch {
    return {
      error: {
        message: `OpenAI returned a non-JSON response with status ${response.status}.`,
      },
    };
  }
}

export function parseOpenAiApiKey(value: string): string {
  const trimmedValue = value.trim();

  if (!trimmedValue.includes("=")) {
    return trimmedValue.replace(/^['"]|['"]$/g, "");
  }

  const [, keyValue] = trimmedValue.split(/=(.*)/s);
  return (keyValue || "").trim().replace(/^['"]|['"]$/g, "");
}

function normalizeBaseUrl(value: string): string {
  return (value.trim() || "").replace(/\/+$/g, "");
}

function getLargeContentModelOverride(settings: PluginSettings): string {
  return settings.largeContentOpenAiModel;
}
