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

export async function highlightReadingKeywordsWithOpenAi(settings: PluginSettings, text: string, abortSignal?: AbortSignal): Promise<string> {
  return requestFullTextEdit(settings, [
    "You add Obsidian highlights to make Markdown easier to skim.",
    "Return the full Markdown text with only ==highlight== markup added.",
    "Do not rewrite, remove, reorder, summarize, translate, or add words.",
    "For each eligible line, highlight the few words that let someone understand the line by reading only highlights.",
    "Highlight at most 5 keywords or short phrases per line.",
    "If a line has fewer than 20 words, highlight at most 3 keywords or short phrases.",
    "Do not touch headings, tables, code fences, blank lines, link-reference lines, lines that are only a few words, or lines that already contain highlights.",
    "Do not highlight entire lines.",
  ].join(" "), "Add only ==highlight== markup to the text.", text, abortSignal, getLargeContentModelOverride(settings), "TEXT TO HIGHLIGHT");
}

export async function generateFileNameFromContent(settings: PluginSettings, currentBaseName: string, text: string, abortSignal?: AbortSignal): Promise<string> {
  const sampledText = buildThreePartSample(text);
  const rawName = await requestOpenAiText(settings, [
    "You create searchable Markdown file names.",
    "Return only one filename stem with no extension.",
    "Use specific keywords from the note.",
    "Make it easy to search and find later.",
    "Use 4 to 10 words, lowercase words separated by hyphens.",
    "Do not include dates unless the note is clearly about a specific date.",
  ].join(" "), [
    `Current filename: ${currentBaseName}`,
    "Create a better filename from this sampled note content.",
    "The sample contains beginning, middle, and ending text and is capped at 5000 characters total.",
    "",
    sampledText,
  ].join("\n"), undefined, abortSignal);

  return sanitizeFileNameStem(rawName) || sanitizeFileNameStem(currentBaseName) || "untitled-note";
}

export async function generateFrontMatterFromContent(settings: PluginSettings, currentBaseName: string, text: string, abortSignal?: AbortSignal): Promise<string> {
  const sampledText = buildThreePartSample(text);
  const frontMatter = await requestOpenAiText(settings, [
    "You create useful YAML frontmatter for Markdown notes.",
    "Return only a YAML frontmatter block, including the opening and closing --- lines.",
    "Do not wrap it in code fences.",
    "Use concise, searchable fields that help find, organize, and filter notes.",
    "Prefer fields: title, aliases, tags, keywords, summary, content_type, topics, people, organizations, status.",
    "Omit fields when the sampled content does not support them.",
    "Use safe YAML strings and arrays.",
  ].join(" "), [
    `Current filename: ${currentBaseName}`,
    "Create frontmatter from this sampled note content.",
    "The sample contains beginning, middle, and ending text and is capped at 5000 characters total.",
    "",
    sampledText,
  ].join("\n"), undefined, abortSignal);

  return normalizeFrontMatter(frontMatter);
}

export async function generateSummaryFromContent(settings: PluginSettings, text: string, abortSignal?: AbortSignal): Promise<string> {
  return requestOpenAiText(settings, [
    "You summarize Markdown notes for Obsidian.",
    "Return only a concise plain-text summary.",
    "Use one to three sentences.",
    "Preserve important names, dates, decisions, and next actions.",
    "Do not wrap the result in quotes or code fences.",
  ].join(" "), [
    "Create a short summary from this sampled note content.",
    "",
    buildThreePartSample(text),
  ].join("\n"), undefined, abortSignal).then((summary) => summary.trim().replace(/\s+/g, " "));
}

export async function generateDelimitedSummaryPrefix(settings: PluginSettings, text: string, abortSignal?: AbortSignal): Promise<string> {
  return requestOpenAiText(settings, [
    "You create searchable one-line summary prefixes for Markdown notes.",
    "Return only the summary prefix text.",
    "Use 4 to 14 words.",
    "Prefer important names, places, organizations, dates, topics, and identifiers from the note.",
    "Use title-style plain text, not Markdown.",
    "Do not include the delimiter :-:.",
    "Do not wrap the result in quotes or code fences.",
  ].join(" "), [
    "Create a short prefix from this sampled note content.",
    "",
    buildThreePartSample(text),
  ].join("\n"), undefined, abortSignal).then((summary) => summary.trim().replace(/\s+/g, " ").replace(/:-:/g, "").trim());
}

export async function generateTagsFromContent(settings: PluginSettings, text: string, abortSignal?: AbortSignal): Promise<string[]> {
  const rawTags = await requestOpenAiText(settings, [
    "You generate useful Obsidian tags from Markdown note content.",
    "Return only tags separated by commas.",
    "Use 3 to 10 concise lowercase tags.",
    "Tags must not include #, spaces, punctuation, quotes, YAML, or code fences.",
    "Use hyphens only when needed inside a tag.",
  ].join(" "), [
    "Generate tags from this sampled note content.",
    "",
    buildThreePartSample(text),
  ].join("\n"), undefined, abortSignal);

  return normalizeTags(rawTags);
}

export async function classifyFolderFromContent(settings: PluginSettings, folders: string[], text: string, abortSignal?: AbortSignal): Promise<string> {
  const folderList = folders.length > 0 ? folders : ["Jobs", "Clients", "DevOps", "Finance"];
  const rawFolder = await requestOpenAiText(settings, [
    "You classify Obsidian notes into one folder.",
    "Return only one folder name from the allowed folder list.",
    "Do not include explanation, YAML, quotes, slashes, or code fences.",
  ].join(" "), [
    `Allowed folders: ${folderList.join(", ")}`,
    "",
    "Choose the best folder for this sampled note content.",
    "",
    buildThreePartSample(text),
  ].join("\n"), undefined, abortSignal);
  const normalized = sanitizeFolderName(rawFolder);
  const exactMatch = folderList.find((folder) => folder.toLowerCase() === normalized.toLowerCase());

  return exactMatch || folderList[0];
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

export function applyFrontMatter(text: string, frontMatter: string): string {
  const normalizedFrontMatter = normalizeFrontMatter(frontMatter);

  if (/^---\n[\s\S]*?\n---\n?/.test(text)) {
    return text.replace(/^---\n[\s\S]*?\n---\n?/, `${normalizedFrontMatter}\n\n`);
  }

  return `${normalizedFrontMatter}\n\n${text.replace(/^\n+/, "")}`;
}

export function applySummary(text: string, summary: string): string {
  const cleanSummary = summary.trim();

  if (!cleanSummary) {
    return text;
  }

  if (/^---\n[\s\S]*?\n---\n?/.test(text)) {
    const updated = text.replace(/^---\n([\s\S]*?)\n---\n?/, (_match, body: string) => {
      const lines = body.split("\n");
      const summaryIndex = lines.findIndex((line) => /^summary\s*:/i.test(line));
      const summaryLine = `summary: ${JSON.stringify(cleanSummary)}`;

      if (summaryIndex >= 0) {
        lines[summaryIndex] = summaryLine;
      } else {
        lines.push(summaryLine);
      }

      return `---\n${lines.join("\n")}\n---\n\n`;
    });

    return updated;
  }

  const section = `## Summary\n\n${cleanSummary}`;

  if (/^## Summary\s*$/im.test(text)) {
    return text.replace(/^## Summary\s*\n+[\s\S]*?(?=\n#{1,6}\s|\s*$)/im, `${section}\n\n`);
  }

  return `${section}\n\n${text.replace(/^\n+/, "")}`;
}

export function applyTagsFrontMatter(text: string, tags: string[]): string {
  const normalizedTags = [...new Set(tags.map((tag) => sanitizeTag(tag)).filter(Boolean))];

  if (normalizedTags.length === 0) {
    return text;
  }

  const tagsBlock = ["tags:", ...normalizedTags.map((tag) => `  - ${tag}`)].join("\n");

  if (/^---\n[\s\S]*?\n---\n?/.test(text)) {
    return text.replace(/^---\n([\s\S]*?)\n---\n?/, (_match, body: string) => {
      let skippingTagsList = false;
      const withoutExistingTags = body
        .split("\n")
        .filter((line) => {
          if (/^tags\s*:/i.test(line)) {
            skippingTagsList = true;
            return false;
          }

          if (skippingTagsList && /^\s*-\s+/.test(line)) {
            return false;
          }

          skippingTagsList = false;
          return true;
        })
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

      return `---\n${[withoutExistingTags, tagsBlock].filter(Boolean).join("\n")}\n---\n\n`;
    });
  }

  return `---\n${tagsBlock}\n---\n\n${text.replace(/^\n+/, "")}`;
}

export function sanitizeFileNameStem(value: string): string {
  return value
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\.md$/i, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s._-]/g, " ")
    .replace(/[\s._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100)
    .replace(/-+$/g, "");
}

export function normalizeTags(value: string): string[] {
  return value
    .replace(/^```[\s\S]*?\n/i, "")
    .replace(/```$/i, "")
    .split(/[,\n]+/)
    .map((tag) => sanitizeTag(tag))
    .filter(Boolean);
}

function sanitizeTag(value: string): string {
  return value
    .trim()
    .replace(/^["'`#]+|["'`]+$/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9/_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
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

function normalizeFrontMatter(value: string): string {
  const withoutFences = value
    .trim()
    .replace(/^```(?:ya?ml)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  const body = withoutFences
    .replace(/^---\s*/, "")
    .replace(/\s*---$/, "")
    .trim();

  return `---\n${body}\n---`;
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
  const chunks = splitTextForAi(text, FULL_TEXT_CHUNK_CHAR_LIMIT);

  if (chunks.length === 1) {
    return requestOpenAiText(
      settings,
      `${baseInstructions} Return only the complete revised text for the provided input. Do not add any prefix, suffix, commentary, chunk marker, or explanation.`,
      `${userInstruction}\n\n${label}:\n${text}`,
      modelOverride,
      abortSignal,
    );
  }

  const outputs: string[] = [];
  for (let index = 0; index < chunks.length; index++) {
    const chunk = chunks[index];
    const previousContext = chunks[index - 1]?.slice(-FULL_TEXT_CONTEXT_CHAR_LIMIT) || "";
    const nextContext = chunks[index + 1]?.slice(0, FULL_TEXT_CONTEXT_CHAR_LIMIT) || "";
    const chunkInstructions = [
      baseInstructions,
      `You are editing chunk ${index + 1} of ${chunks.length} from one Markdown file.`,
      "Use the read-only neighboring context only to understand continuity.",
      "Return only the revised text for this chunk.",
      "Do not return the read-only context.",
      "Do not add headings, separators, code fences, explanations, or chunk markers.",
      "Preserve the chunk's leading and trailing newlines exactly unless the requested edit requires changing those characters.",
    ].join(" ");
    outputs.push(await requestOpenAiText(
      settings,
      chunkInstructions,
      buildChunkPrompt(userInstruction, label, chunk, index + 1, chunks.length, previousContext, nextContext),
      modelOverride,
      abortSignal,
    ));
  }

  return outputs.join("");
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
  const apiKey = parseOpenAiApiKey(settings.openAiApiKey);

  if (!apiKey) {
    throw new Error("OpenAI API key is not configured.");
  }

  const model = modelOverride?.trim() || settings.openAiModel.trim() || "openai/gpt-5-mini";
  const response = await fetch(`${normalizeBaseUrl(settings.openAiApiBase || "https://openrouter.ai/api/v1")}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    signal,
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: instructions },
        { role: "user", content: input },
      ],
      max_tokens: estimateMaxCompletionTokens(input),
      temperature: 0,
    }),
  });

  const data = await readOpenAiResponse(response);

  if (!response.ok) {
    throw new Error(data.error?.message || `OpenAI request failed with ${response.status}.`);
  }

  const outputText = data.choices?.[0]?.message?.content
    || data.output_text
    || data.output
      ?.flatMap((item) => item.content || [])
      .filter((content) => content.type === "output_text" && typeof content.text === "string")
      .map((content) => content.text)
      .join("");

  if (!outputText) {
    throw new Error("OpenRouter response did not include text output.");
  }

  recordAiUsage("openrouter", model, input, instructions, outputText, data.usage);
  return outputText;
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
