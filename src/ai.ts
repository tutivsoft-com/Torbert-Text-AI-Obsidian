import type { PluginSettings } from "./types";

// --- Pattern B remote key manifest (TutivSoft.OpenAiKeyManifest port) ---
// Fetches this app's own encrypted OpenRouter key from a GitHub-hosted manifest as a
// fallback when no manual "OpenRouter API key" setting is configured. Same algorithm as
// the C# reference (desktop-app-Windows-Kest-LLM-Chat-AI/.../RemoteOpenAiKeyManifest.cs),
// the verified Python port (tool-python-openrouter-manifest-crypto), and the earlier
// Obsidian ports (Culebra, Denali AI Renamer): AES-256-GCM + PBKDF2-HMAC-SHA256, 210,000
// iterations. The manual key setting always takes priority when set. Uses plain `fetch`
// (not Obsidian's `requestUrl`) for consistency with this file's existing OpenRouter chat-
// completions call and so this module stays free of an `obsidian` runtime import (keeps it
// bundleable/testable standalone via tests/features.test.mjs, which externals "obsidian").
const REMOTE_MANIFEST_PASSPHRASE = "Kivu.RemoteKeyManifest.v1.2026D";
const REMOTE_MANIFEST_URL =
  "https://raw.githubusercontent.com/tutivsoft-com/Resources/main/Torbert-Text-AI-Obsidian-public.txt";

interface EncryptedSecretEnvelope {
  q: number;
  x: string;
  w: string;
  n: number;
  a: string;
  b: string;
  c: string;
  d: string;
}

interface RemoteKeySlot {
  i: string;
  ii?: string;
  s: string;
  v: EncryptedSecretEnvelope;
}

interface RemoteKeyManifest {
  m: number;
  n?: string; // next manifest URL (decoy-adjacent field, same shape as the live ai1.txt)
  r: RemoteKeySlot[];
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function decryptSecretEnvelope(envelope: EncryptedSecretEnvelope, passphrase: string): Promise<string> {
  if (envelope.x !== "AES-256-GCM" || envelope.w !== "PBKDF2-HMAC-SHA256") {
    throw new Error(`Unsupported manifest envelope algorithm/kdf: ${envelope.x} / ${envelope.w}`);
  }

  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );

  const key = await window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: base64ToBytes(envelope.a),
      iterations: envelope.n,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );

  const ciphertext = base64ToBytes(envelope.c);
  const tag = base64ToBytes(envelope.d);
  const ciphertextAndTag = new Uint8Array<ArrayBuffer>(new ArrayBuffer(ciphertext.length + tag.length));
  ciphertextAndTag.set(ciphertext, 0);
  ciphertextAndTag.set(tag, ciphertext.length);

  const plaintext = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(envelope.b) },
    key,
    ciphertextAndTag,
  );

  return new TextDecoder().decode(plaintext);
}

function selectSlot(manifest: RemoteKeyManifest, wantState: "active" | "next"): RemoteKeySlot | null {
  const byMarker = manifest.r.find((slot) => slot.ii === wantState);
  if (byMarker) {
    return byMarker;
  }
  // Fallback for manifests without the "ii" marker (matches the C# lib's
  // ActiveKeyId/State-based selection): active = state "0", next = state "1".
  const fallbackState = wantState === "active" ? "0" : "1";
  return manifest.r.find((slot) => slot.s === fallbackState) ?? null;
}

async function fetchRemoteManifest(url: string): Promise<RemoteKeyManifest> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Manifest fetch failed: HTTP ${response.status}`);
  }
  return await response.json() as RemoteKeyManifest;
}

async function tryDecryptManifestKey(manifest: RemoteKeyManifest, source: string): Promise<string> {
  const active = selectSlot(manifest, "active");
  if (active) {
    try {
      const key = (await decryptSecretEnvelope(active.v, REMOTE_MANIFEST_PASSPHRASE)).trim();
      if (key) return key;
    } catch (error) {
      console.warn("Torbert Text AI: active manifest slot failed to decrypt", source, error);
    }
  }

  const next = selectSlot(manifest, "next");
  if (next) {
    try {
      const key = (await decryptSecretEnvelope(next.v, REMOTE_MANIFEST_PASSPHRASE)).trim();
      if (key) return key;
    } catch (error) {
      console.warn("Torbert Text AI: next manifest slot failed to decrypt", source, error);
    }
  }

  throw new Error("Remote key manifest did not decrypt to a usable key.");
}

// Cached once resolved so every AI call doesn't re-fetch the manifest; cleared implicitly
// on plugin reload (module-level state) in case the key was rotated mid-session.
let remoteApiKeyCache: string | null = null;

/**
 * Fetches and decrypts this app's own OpenRouter key from its GitHub manifest,
 * falling back to the manifest's NextManifestUrl if the primary one is
 * unreachable or fails to decrypt (key rotation / relocation support).
 */
async function fetchRemoteApiKey(): Promise<string> {
  if (remoteApiKeyCache) {
    return remoteApiKeyCache;
  }

  try {
    const manifest = await fetchRemoteManifest(REMOTE_MANIFEST_URL);
    const key = await tryDecryptManifestKey(manifest, REMOTE_MANIFEST_URL);
    remoteApiKeyCache = key;
    return key;
  } catch (primaryError) {
    console.warn("Torbert Text AI: primary manifest failed, trying next-manifest fallback", primaryError);
    const primaryManifest = await fetchRemoteManifest(REMOTE_MANIFEST_URL).catch(() => null);
    const nextUrl = primaryManifest?.n;
    if (nextUrl && nextUrl !== REMOTE_MANIFEST_URL) {
      const nextManifest = await fetchRemoteManifest(nextUrl);
      const key = await tryDecryptManifestKey(nextManifest, nextUrl);
      remoteApiKeyCache = key;
      return key;
    }
    throw primaryError;
  }
}

/**
 * Resolves the OpenRouter API key to use: the manually-configured setting always wins
 * when set, otherwise falls back to this app's own remote key manifest.
 */
async function resolveApiKey(settings: PluginSettings): Promise<string> {
  const manualKey = parseOpenAiApiKey(settings.openAiApiKey);
  if (manualKey) {
    return manualKey;
  }

  return fetchRemoteApiKey();
}

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
  let apiKey: string;
  try {
    apiKey = await resolveApiKey(settings);
  } catch (error) {
    console.error("Torbert Text AI: failed to resolve an OpenRouter API key", error);
    throw new Error("Torbert AI is temporarily unavailable. Check your connection and try again.");
  }

  if (!apiKey) {
    throw new Error("OpenAI API key is not configured.");
  }

  const model = modelOverride?.trim() || settings.openAiModel.trim() || "~deepseek/deepseek-v4-flash-latest";
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
