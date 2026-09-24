var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => TorbertTextAiPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian5 = require("obsidian");

// src/ai.ts
var REMOTE_MANIFEST_PASSPHRASE = "Kivu.RemoteKeyManifest.v1.2026D";
var REMOTE_MANIFEST_URL = "https://raw.githubusercontent.com/tutivsoft-com/Resources/main/Torbert-Text-AI-Obsidian-public.txt";
function base64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
async function decryptSecretEnvelope(envelope, passphrase) {
  if (envelope.x !== "AES-256-GCM" || envelope.w !== "PBKDF2-HMAC-SHA256") {
    throw new Error(`Unsupported manifest envelope algorithm/kdf: ${envelope.x} / ${envelope.w}`);
  }
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  const key = await window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: base64ToBytes(envelope.a),
      iterations: envelope.n,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
  const ciphertext = base64ToBytes(envelope.c);
  const tag = base64ToBytes(envelope.d);
  const ciphertextAndTag = new Uint8Array(new ArrayBuffer(ciphertext.length + tag.length));
  ciphertextAndTag.set(ciphertext, 0);
  ciphertextAndTag.set(tag, ciphertext.length);
  const plaintext = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(envelope.b) },
    key,
    ciphertextAndTag
  );
  return new TextDecoder().decode(plaintext);
}
function selectSlot(manifest, wantState) {
  var _a;
  const byMarker = manifest.r.find((slot) => slot.ii === wantState);
  if (byMarker) {
    return byMarker;
  }
  const fallbackState = wantState === "active" ? "0" : "1";
  return (_a = manifest.r.find((slot) => slot.s === fallbackState)) != null ? _a : null;
}
async function fetchRemoteManifest(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Manifest fetch failed: HTTP ${response.status}`);
  }
  return await response.json();
}
async function tryDecryptManifestKey(manifest, source) {
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
var remoteApiKeyCache = null;
async function fetchRemoteApiKey() {
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
    const nextUrl = primaryManifest == null ? void 0 : primaryManifest.n;
    if (nextUrl && nextUrl !== REMOTE_MANIFEST_URL) {
      const nextManifest = await fetchRemoteManifest(nextUrl);
      const key = await tryDecryptManifestKey(nextManifest, nextUrl);
      remoteApiKeyCache = key;
      return key;
    }
    throw primaryError;
  }
}
async function resolveApiKey(settings) {
  const manualKey = parseOpenAiApiKey(settings.openAiApiKey);
  if (manualKey) {
    return manualKey;
  }
  return fetchRemoteApiKey();
}
var OPENAI_REQUEST_TIMEOUT_MS = 12e4;
var FULL_TEXT_CHUNK_CHAR_LIMIT = 48e3;
var FULL_TEXT_HARD_CHUNK_CHAR_LIMIT = 9e4;
var FULL_TEXT_CONTEXT_CHAR_LIMIT = 1600;
var SUSPICIOUS_OUTPUT_RATIO_LOW = 0.55;
var SUSPICIOUS_OUTPUT_RATIO_HIGH = 1.8;
var activeUsageCollector = null;
async function collectAiUsageDuring(work) {
  const previousCollector = activeUsageCollector;
  const requests = [];
  activeUsageCollector = requests;
  try {
    const result = await work();
    return { result, usage: summarizeAiUsage(requests) };
  } finally {
    activeUsageCollector = previousCollector;
  }
}
function summarizeAiUsage(requests) {
  return requests.reduce((summary, request) => ({
    requests: summary.requests + 1,
    inputChars: summary.inputChars + request.inputChars,
    outputChars: summary.outputChars + request.outputChars,
    inputTokens: summary.inputTokens + request.inputTokens,
    outputTokens: summary.outputTokens + request.outputTokens,
    totalTokens: summary.totalTokens + request.totalTokens
  }), {
    requests: 0,
    inputChars: 0,
    outputChars: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0
  });
}
async function rewriteWithOpenAi(settings, instruction, text, abortSignal) {
  return requestFullTextEdit(settings, [
    "You edit Markdown text.",
    "Return only the revised Markdown text.",
    "Do not wrap the result in code fences.",
    "Preserve links, headings, lists, frontmatter, code blocks, and existing Markdown syntax unless the user instruction explicitly asks you to change them."
  ].join(" "), instruction, text, abortSignal, getLargeContentModelOverride(settings));
}
async function highlightReadingKeywordsWithOpenAi(settings, text, abortSignal) {
  return requestFullTextEdit(settings, [
    "You add Obsidian highlights to make Markdown easier to skim.",
    "Return the full Markdown text with only ==highlight== markup added.",
    "Do not rewrite, remove, reorder, summarize, translate, or add words.",
    "For each eligible line, highlight the few words that let someone understand the line by reading only highlights.",
    "Highlight at most 5 keywords or short phrases per line.",
    "If a line has fewer than 20 words, highlight at most 3 keywords or short phrases.",
    "Do not touch headings, tables, code fences, blank lines, link-reference lines, lines that are only a few words, or lines that already contain highlights.",
    "Do not highlight entire lines."
  ].join(" "), "Add only ==highlight== markup to the text.", text, abortSignal, getLargeContentModelOverride(settings), "TEXT TO HIGHLIGHT");
}
async function generateSummaryFromContent(settings, text, abortSignal) {
  return requestOpenAiText(settings, [
    "You summarize Markdown notes for Obsidian.",
    "Return only a concise plain-text summary.",
    "Use one to three sentences.",
    "Preserve important names, dates, decisions, and next actions.",
    "Do not wrap the result in quotes or code fences."
  ].join(" "), [
    "Create a short summary from this sampled note content.",
    "",
    buildThreePartSample(text)
  ].join("\n"), void 0, abortSignal).then((summary) => summary.trim().replace(/\s+/g, " "));
}
async function generateDelimitedSummaryPrefix(settings, text, abortSignal) {
  return requestOpenAiText(settings, [
    "You create searchable one-line summary prefixes for Markdown notes.",
    "Return only the summary prefix text.",
    "Use 4 to 14 words.",
    "Prefer important names, places, organizations, dates, topics, and identifiers from the note.",
    "Use title-style plain text, not Markdown.",
    "Do not include the delimiter :-:.",
    "Do not wrap the result in quotes or code fences."
  ].join(" "), [
    "Create a short prefix from this sampled note content.",
    "",
    buildThreePartSample(text)
  ].join("\n"), void 0, abortSignal).then((summary) => summary.trim().replace(/\s+/g, " ").replace(/:-:/g, "").trim());
}
async function classifyFolderFromContent(settings, folders, text, abortSignal) {
  const folderList = folders.length > 0 ? folders : ["Jobs", "Clients", "DevOps", "Finance"];
  const rawFolder = await requestOpenAiText(settings, [
    "You classify Obsidian notes into one folder.",
    "Return only one folder name from the allowed folder list.",
    "Do not include explanation, YAML, quotes, slashes, or code fences."
  ].join(" "), [
    `Allowed folders: ${folderList.join(", ")}`,
    "",
    "Choose the best folder for this sampled note content.",
    "",
    buildThreePartSample(text)
  ].join("\n"), void 0, abortSignal);
  const normalized = sanitizeFolderName(rawFolder);
  const exactMatch = folderList.find((folder) => folder.toLowerCase() === normalized.toLowerCase());
  return exactMatch || folderList[0];
}
function buildThreePartSample(text, maxCharacters = 5e3) {
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
    text.slice(-partLength)
  ].join("\n").slice(0, maxCharacters);
}
function applySummary(text, summary) {
  var _a;
  const cleanSummary = summary.trim();
  if (!cleanSummary) {
    return text;
  }
  const section = `## Summary

${cleanSummary}`;
  const frontmatter = ((_a = text.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/)) == null ? void 0 : _a[0]) || "";
  const body = text.slice(frontmatter.length).replace(/^\s*\n/, "");
  if (/^## Summary\s*$/im.test(body)) {
    return frontmatter + body.replace(/^## Summary\s*\n+[\s\S]*?(?=\n#{1,6}\s|\s*$)/im, `${section}

`);
  }
  return `${frontmatter}${frontmatter ? "\n" : ""}${section}

${body.replace(/^\n+/, "")}`;
}
function sanitizeFolderName(value) {
  return value.trim().replace(/^["'`]+|["'`]+$/g, "").replace(/\\/g, "/").split("/").map((part) => part.trim().replace(/[<>:"|?*]/g, "").replace(/\s+/g, " ")).filter(Boolean).join("/");
}
async function requestOpenAiText(settings, instructions, input, modelOverride, abortSignal) {
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  const timeout = window.setTimeout(() => controller.abort(), OPENAI_REQUEST_TIMEOUT_MS);
  if (abortSignal == null ? void 0 : abortSignal.aborted) {
    controller.abort();
  } else {
    abortSignal == null ? void 0 : abortSignal.addEventListener("abort", abortFromCaller, { once: true });
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
    abortSignal == null ? void 0 : abortSignal.removeEventListener("abort", abortFromCaller);
  }
}
async function requestFullTextEdit(settings, baseInstructions, userInstruction, text, abortSignal, modelOverride, label = "TEXT TO EDIT") {
  var _a, _b;
  const chunks = splitTextForAi(text, FULL_TEXT_CHUNK_CHAR_LIMIT);
  if (chunks.length === 1) {
    return requestOpenAiText(
      settings,
      `${baseInstructions} Return only the complete revised text for the provided input. Do not add any prefix, suffix, commentary, chunk marker, or explanation.`,
      `${userInstruction}

${label}:
${text}`,
      modelOverride,
      abortSignal
    );
  }
  const outputs = [];
  for (let index = 0; index < chunks.length; index++) {
    const chunk = chunks[index];
    const previousContext = ((_a = chunks[index - 1]) == null ? void 0 : _a.slice(-FULL_TEXT_CONTEXT_CHAR_LIMIT)) || "";
    const nextContext = ((_b = chunks[index + 1]) == null ? void 0 : _b.slice(0, FULL_TEXT_CONTEXT_CHAR_LIMIT)) || "";
    const chunkInstructions = [
      baseInstructions,
      `You are editing chunk ${index + 1} of ${chunks.length} from one Markdown file.`,
      "Use the read-only neighboring context only to understand continuity.",
      "Return only the revised text for this chunk.",
      "Do not return the read-only context.",
      "Do not add headings, separators, code fences, explanations, or chunk markers.",
      "Preserve the chunk's leading and trailing newlines exactly unless the requested edit requires changing those characters."
    ].join(" ");
    outputs.push(await requestOpenAiText(
      settings,
      chunkInstructions,
      buildChunkPrompt(userInstruction, label, chunk, index + 1, chunks.length, previousContext, nextContext),
      modelOverride,
      abortSignal
    ));
  }
  return outputs.join("");
}
function buildChunkPrompt(userInstruction, label, chunk, index, total, previousContext, nextContext) {
  return [
    userInstruction,
    previousContext ? `
READ-ONLY CONTEXT BEFORE CHUNK ${index}:
${previousContext}` : "",
    `
${label} CHUNK ${index} OF ${total}:
${chunk}`,
    nextContext ? `
READ-ONLY CONTEXT AFTER CHUNK ${index}:
${nextContext}` : ""
  ].filter(Boolean).join("\n");
}
function splitTextForAi(text, limit) {
  if (text.length <= limit) {
    return [text];
  }
  const chunks = [];
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
function findLastBreak(text, marker, start, end, minimumBreak) {
  const index = text.lastIndexOf(marker, end);
  return index >= minimumBreak && index >= start ? index + marker.length : -1;
}
function findLastSoftBreakInsideLongLine(text, start, end) {
  const slice = text.slice(start, end);
  const match = [...slice.matchAll(/[ \t.,;:!?)]/g)].pop();
  return (match == null ? void 0 : match.index) !== void 0 && match.index > 0 ? start + match.index + 1 : end;
}
async function requestOpenAiResponsesText(settings, instructions, input, modelOverride, signal) {
  var _a, _b, _c, _d, _e;
  let apiKey;
  try {
    apiKey = await resolveApiKey(settings);
  } catch (error) {
    console.error("Torbert Text AI: failed to resolve an OpenRouter API key", error);
    throw new Error("Torbert AI is temporarily unavailable. Check your connection and try again.");
  }
  if (!apiKey) {
    throw new Error("OpenAI API key is not configured.");
  }
  const model = (modelOverride == null ? void 0 : modelOverride.trim()) || settings.openAiModel.trim() || "~deepseek/deepseek-v4-flash-latest";
  const response = await fetch(`${normalizeBaseUrl(settings.openAiApiBase || "https://openrouter.ai/api/v1")}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    signal,
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: instructions },
        { role: "user", content: input }
      ],
      max_tokens: estimateMaxCompletionTokens(input),
      temperature: 0
    })
  });
  const data = await readOpenAiResponse(response);
  if (!response.ok) {
    throw new Error(((_a = data.error) == null ? void 0 : _a.message) || `OpenAI request failed with ${response.status}.`);
  }
  const outputText = ((_d = (_c = (_b = data.choices) == null ? void 0 : _b[0]) == null ? void 0 : _c.message) == null ? void 0 : _d.content) || data.output_text || ((_e = data.output) == null ? void 0 : _e.flatMap((item) => item.content || []).filter((content) => content.type === "output_text" && typeof content.text === "string").map((content) => content.text).join(""));
  if (!outputText) {
    throw new Error("OpenRouter response did not include text output.");
  }
  recordAiUsage("openrouter", model, input, instructions, outputText, data.usage);
  return outputText;
}
function recordAiUsage(provider, model, input, instructions, output, usage) {
  var _a, _b, _c, _d, _e;
  const inputTokens = (_b = (_a = usage == null ? void 0 : usage.input_tokens) != null ? _a : usage == null ? void 0 : usage.prompt_tokens) != null ? _b : 0;
  const outputTokens = (_d = (_c = usage == null ? void 0 : usage.output_tokens) != null ? _c : usage == null ? void 0 : usage.completion_tokens) != null ? _d : 0;
  const totalTokens = (_e = usage == null ? void 0 : usage.total_tokens) != null ? _e : inputTokens + outputTokens;
  const outputRatio = input.length > 0 ? output.length / input.length : 1;
  if (input.length > 1e3 && (outputRatio < SUSPICIOUS_OUTPUT_RATIO_LOW || outputRatio > SUSPICIOUS_OUTPUT_RATIO_HIGH)) {
    console.warn("[Torbert Text AI] Suspicious AI character delta", {
      provider,
      model,
      inputChars: input.length,
      outputChars: output.length,
      outputRatio: Number(outputRatio.toFixed(3))
    });
  }
  activeUsageCollector == null ? void 0 : activeUsageCollector.push({
    provider,
    model,
    inputChars: input.length,
    outputChars: output.length,
    instructionChars: instructions.length,
    inputTokens,
    outputTokens,
    totalTokens
  });
}
function estimateMaxCompletionTokens(input) {
  return Math.min(32e3, Math.max(2e3, Math.ceil(input.length / 3) + 1e3));
}
async function readOpenAiResponse(response) {
  try {
    return await response.json();
  } catch (e) {
    return {
      error: {
        message: `OpenAI returned a non-JSON response with status ${response.status}.`
      }
    };
  }
}
function parseOpenAiApiKey(value) {
  const trimmedValue = value.trim();
  if (!trimmedValue.includes("=")) {
    return trimmedValue.replace(/^['"]|['"]$/g, "");
  }
  const [, keyValue] = trimmedValue.split(/=(.*)/s);
  return (keyValue || "").trim().replace(/^['"]|['"]$/g, "");
}
function normalizeBaseUrl(value) {
  return (value.trim() || "").replace(/\/+$/g, "");
}
function getLargeContentModelOverride(settings) {
  return settings.largeContentOpenAiModel;
}

// src/feature-utils.ts
var parseFolderList = (value) => [...new Set(value.split(/[\n,]+/).map((folder) => folder.trim().replace(/^\/+|\/+$/g, "")).filter(Boolean))];
var isWeakTitle = (baseName) => {
  const normalized = baseName.toLowerCase().trim();
  return [
    /^untitled(?:\s+\d+)?$/,
    /^new note(?:\s+\d+)?$/,
    /^note(?:\s+\d+)?$/,
    /^draft(?:\s+\d+)?$/,
    /^\d{4}-\d{2}-\d{2}(?:[\s_-]\d+)?$/,
    /^\d{8}(?:[\s_-]\d+)?$/,
    /^20\d{2}[\s_-]?\d{1,2}[\s_-]?\d{1,2}$/
  ].some((pattern) => pattern.test(normalized));
};
var normalizeNoteForSimilarity = (content) => content.replace(/^---\n[\s\S]*?\n---\n?/, "").replace(/```[\s\S]*?```/g, " ").replace(/https?:\/\/\S+/gi, " ").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
var noteSimilarity = (left, right) => {
  const leftTokens = new Set(normalizeNoteForSimilarity(left).split(" ").filter((token) => token.length > 2));
  const rightTokens = new Set(normalizeNoteForSimilarity(right).split(" ").filter((token) => token.length > 2));
  if (leftTokens.size < 8 || rightTokens.size < 8) {
    return 0;
  }
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const smallerSetSize = Math.min(leftTokens.size, rightTokens.size);
  return smallerSetSize === 0 ? 0 : intersection / smallerSetSize;
};
var cleanupMarkdownStructure = (text) => {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const cleaned = [];
  let previousHeadingLevel = 0;
  let inFence = false;
  for (const rawLine of lines) {
    let line = rawLine.replace(/[ \t]+$/g, "");
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      cleaned.push(line);
      continue;
    }
    if (!inFence) {
      line = line.replace(/^(#{1,6})([^\s#])/g, "$1 $2").replace(/^(\s*)[-*+]\s+\[done\]\s*/i, (_match, indent) => `${indent}- [x] `).replace(/^(\s*)[-*+]\s+\[todo\]\s*/i, (_match, indent) => `${indent}- [ ] `).replace(/^(\s*)[-*+]\s+\[x\]\s*/i, (_match, indent) => `${indent}- [x] `).replace(/^(\s*)[-*+]\s+\[\s*\]\s*/g, (_match, indent) => `${indent}- [ ] `).replace(/^(\s*)[-*+]\s+/g, (_match, indent) => `${indent.replace(/\t/g, "  ")}- `);
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        let level = headingMatch[1].length;
        if (previousHeadingLevel > 0 && level > previousHeadingLevel + 1) {
          level = previousHeadingLevel + 1;
        }
        previousHeadingLevel = level;
        line = `${"#".repeat(level)} ${headingMatch[2].trim()}`;
        while (cleaned.length > 0 && cleaned[cleaned.length - 1] === "") {
          cleaned.pop();
        }
        if (cleaned.length > 0) {
          cleaned.push("");
        }
        cleaned.push(line);
        cleaned.push("");
        continue;
      }
    }
    cleaned.push(line);
  }
  return cleaned.join("\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]+\n/g, "\n").trim();
};
var extractActionItems = (text) => {
  const actionPatterns = [
    /\b(todo|to-do|follow up|follow-up|action|next step|deadline|due|call|email|send|schedule|review|fix|ship|pay|renew)\b/i,
    /@\w+/,
    /\b\d{4}-\d{2}-\d{2}\b/,
    /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}\b/i
  ];
  return [...new Set(text.replace(/^## Action Items\s*\n+[\s\S]*?(?=\n#{1,6}\s|\s*$)/im, "").split("\n").map((line) => line.trim()).filter((line) => line && actionPatterns.some((pattern) => pattern.test(line))).map((line) => line.replace(/^[-*+]\s+/, "").replace(/^\[[ xX]\]\s+/, "").trim()).map((line) => `- [ ] ${line}`))];
};
var applyActionItemsSection = (text) => {
  const actionItems = extractActionItems(text);
  const section = actionItems.length > 0 ? `## Action Items

${actionItems.join("\n")}` : "## Action Items\n\n- [ ] Review this note for next steps.";
  if (/^## Action Items\s*$/im.test(text)) {
    return {
      newText: text.replace(/^## Action Items\s*\n+[\s\S]*?(?=\n#{1,6}\s|\s*$)/im, `${section}

`),
      count: actionItems.length
    };
  }
  return {
    newText: `${text.replace(/\s+$/g, "")}

${section}
`,
    count: actionItems.length
  };
};

// src/logger.ts
var FileLogger = class {
  constructor(adapter, logFilePath) {
    __publicField(this, "adapter", adapter);
    __publicField(this, "logFilePath", logFilePath);
    __publicField(this, "isEnabled", true);
  }
  setEnabled(isEnabled) {
    this.isEnabled = isEnabled;
  }
  info(source, message, ...details) {
    void this.writeLog("INFO", source, message, ...details);
  }
  warn(source, message, ...details) {
    void this.writeLog("WARN", source, message, ...details);
  }
  error(source, message, ...details) {
    void this.writeLog("ERROR", source, message, ...details);
  }
  formatMessage(level, source, message, ...details) {
    const timestamp = (/* @__PURE__ */ new Date()).toISOString();
    const formattedDetails = details.map((detail) => {
      if (typeof detail === "object") {
        try {
          return JSON.stringify(detail);
        } catch (e) {
          return "Unserializable Object";
        }
      }
      return String(detail);
    }).join(" ");
    return `[${timestamp}] [${level}] [${source}] - ${message} ${formattedDetails}
`;
  }
  async writeLog(level, source, message, ...details) {
    if (!this.isEnabled) {
      return;
    }
    try {
      const logMessage = this.formatMessage(level, source, message, ...details);
      switch (level) {
        case "INFO":
          console.log(`[${source}] - ${message}`, ...details);
          break;
        case "WARN":
          console.warn(`[${source}] - ${message}`, ...details);
          break;
        case "ERROR":
          console.error(`[${source}] - ${message}`, ...details);
          break;
      }
      await this.adapter.append(this.logFilePath, logMessage);
    } catch (error) {
      console.error("Failed to write to log file:", error);
    }
  }
};

// src/billing.ts
var import_obsidian2 = require("obsidian");

// src/constance-account.ts
var import_obsidian = require("obsidian");
var CONSTANCE_ACCOUNT_BASE_URL = "https://app.tutivsoft.com";
function errorDetail(response, fallback) {
  var _a, _b;
  return String(((_a = response.json) == null ? void 0 : _a.detail) || ((_b = response.json) == null ? void 0 : _b.message) || response.text || fallback);
}
async function authenticate(mode, email, password, installationId) {
  var _a;
  const body = mode === "register" ? { email, password, external_customer_id: installationId } : { email, password };
  const response = await (0, import_obsidian.requestUrl)({
    url: `${CONSTANCE_ACCOUNT_BASE_URL}/api/v1/auth/${mode}`,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    throw: false
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(errorDetail(response, `Billing ${mode} failed (HTTP ${response.status})`));
  }
  const token = String(((_a = response.json) == null ? void 0 : _a.access_token) || "");
  if (!token) throw new Error("Constance did not return an account token.");
  return token;
}
async function linkInstallation(adapter, token) {
  const response = await (0, import_obsidian.requestUrl)({
    url: `${CONSTANCE_ACCOUNT_BASE_URL}/api/v1/billing/installations/link`,
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      app_id: adapter.appId,
      installation_id: adapter.installationId,
      legacy_external_customer_id: adapter.installationId,
      platform: "obsidian",
      app_version: adapter.appVersion || void 0
    }),
    throw: false
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(errorDetail(response, `Installation link failed (HTTP ${response.status})`));
  }
}
async function signInBillingAccount(adapter, password, mode) {
  const email = adapter.state.billingEmail.trim().toLowerCase();
  if (!email || !email.includes("@")) throw new Error("Enter a valid billing email.");
  if (password.length < 8) throw new Error("Password must contain at least 8 characters.");
  if (!adapter.installationId) throw new Error("The plugin installation ID is not ready.");
  const token = await authenticate(mode, email, password, adapter.installationId);
  await linkInstallation(adapter, token);
  adapter.state.billingEmail = email;
  adapter.state.billingAccessToken = token;
  adapter.state.billingAccountLinked = true;
  await adapter.persist();
  await adapter.syncBalance();
}
async function claimAccountFreeUsage(state, appId, installationId, eventId, amount) {
  var _a, _b;
  if (!state.billingAccessToken || !state.billingAccountLinked) return { kind: "auth-required" };
  try {
    const response = await (0, import_obsidian.requestUrl)({
      url: `${CONSTANCE_ACCOUNT_BASE_URL}/api/v1/billing/free-usage/claim`,
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${state.billingAccessToken}` },
      body: JSON.stringify({ app_id: appId, installation_id: installationId, event_id: eventId, amount }),
      throw: false
    });
    if (response.status === 402) return { kind: "insufficient" };
    if (response.status === 401 || response.status === 403 || response.status === 404) return { kind: "auth-required" };
    if (response.status < 200 || response.status >= 300) return { kind: "error" };
    return { kind: "ok", remaining: Math.max(0, Number((_b = (_a = response.json) == null ? void 0 : _a.data) == null ? void 0 : _b.remaining) || 0) };
  } catch (error) {
    console.error("Constance account free-usage claim failed", error);
    return { kind: "error" };
  }
}
async function spendAccountCredits(state, appId, installationId, eventId, amount) {
  var _a, _b, _c;
  if (!state.billingAccessToken || !state.billingAccountLinked) return { kind: "auth-required" };
  try {
    const response = await (0, import_obsidian.requestUrl)({
      url: `${CONSTANCE_ACCOUNT_BASE_URL}/api/v1/billing/credits/spend`,
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${state.billingAccessToken}` },
      body: JSON.stringify({ app_id: appId, installation_id: installationId, event_id: eventId, amount }),
      throw: false
    });
    if (response.status === 402) return { kind: "insufficient" };
    if (response.status === 401 || response.status === 403 || response.status === 404) return { kind: "auth-required" };
    if (response.status < 200 || response.status >= 300) return { kind: "error" };
    const balance = Number((_c = (_b = (_a = response.json) == null ? void 0 : _a.data) == null ? void 0 : _b.credits) == null ? void 0 : _c.balance);
    return Number.isFinite(balance) ? { kind: "ok", balance: Math.max(0, balance) } : { kind: "error" };
  } catch (error) {
    console.error("Constance authenticated credit spend failed", error);
    return { kind: "error" };
  }
}
function addBillingAccountSettings(containerEl, adapter) {
  let password = "";
  new import_obsidian.Setting(containerEl).setName("Billing account email").setDesc("Used for sign-in, purchase restore, and checkout. Reinstalling no longer creates a new free allowance.").addText((text) => text.setPlaceholder("you@example.com").setValue(adapter.state.billingEmail).onChange(async (value) => {
    adapter.state.billingEmail = value.trim();
    await adapter.persist();
  }));
  new import_obsidian.Setting(containerEl).setName("Billing account password").setDesc("Used only for this sign-in request. The password is never saved by the plugin.").addText((text) => {
    text.inputEl.type = "password";
    text.setPlaceholder("At least 8 characters").onChange((value) => {
      password = value;
    });
  });
  const status = adapter.state.billingAccountLinked ? "Signed in and linked" : "Not signed in";
  new import_obsidian.Setting(containerEl).setName("Billing account").setDesc(`${status}. The saved bearer session can restore purchases; your password is not stored.`).addButton((button) => button.setButtonText("Sign in").onClick(async () => {
    var _a;
    button.setDisabled(true);
    try {
      await signInBillingAccount(adapter, password, "login");
      new import_obsidian.Notice("Billing account signed in and this installation was linked.");
      (_a = adapter.refresh) == null ? void 0 : _a.call(adapter);
    } catch (error) {
      new import_obsidian.Notice(error instanceof Error ? error.message : "Billing sign-in failed.");
    } finally {
      button.setDisabled(false);
    }
  })).addButton((button) => button.setButtonText("Create account").onClick(async () => {
    var _a;
    button.setDisabled(true);
    try {
      await signInBillingAccount(adapter, password, "register");
      new import_obsidian.Notice("Billing account created and this installation was linked.");
      (_a = adapter.refresh) == null ? void 0 : _a.call(adapter);
    } catch (error) {
      new import_obsidian.Notice(error instanceof Error ? error.message : "Billing account creation failed.");
    } finally {
      button.setDisabled(false);
    }
  })).addButton((button) => button.setButtonText("Sign out").setDisabled(!adapter.state.billingAccessToken).onClick(async () => {
    var _a;
    adapter.state.billingAccessToken = "";
    adapter.state.billingAccountLinked = false;
    await adapter.persist();
    new import_obsidian.Notice("Billing account signed out on this installation.");
    (_a = adapter.refresh) == null ? void 0 : _a.call(adapter);
  }));
}

// src/billing.ts
var BASE_URL = "https://app.tutivsoft.com";
var APP_ID = "torbert-text-ai-obsidian";
var TORBERT_PLAN_CODES = {
  usd_001: "standard",
  usd_005: "pro",
  usd_015: "ultimate"
};
function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}
async function pollCheckoutSettlement(plugin, checkoutId) {
  var _a, _b;
  for (let attempt = 0; attempt < 12; attempt++) {
    await wait(5e3);
    const pending = plugin.settings.pendingCheckout;
    if (!pending || pending.checkoutId !== checkoutId || !plugin.settings.billingAccessToken) return;
    try {
      const response = await (0, import_obsidian2.requestUrl)({
        url: `${BASE_URL}/api/v1/billing/checkouts/${encodeURIComponent(checkoutId)}`,
        method: "GET",
        headers: { Authorization: `Bearer ${plugin.settings.billingAccessToken}` },
        throw: false
      });
      if (response.status === 401 || response.status === 403) {
        plugin.settings.billingAccessToken = "";
        plugin.settings.billingAccountLinked = false;
        plugin.settings.pendingCheckout = null;
        await plugin.saveSettings();
        return;
      }
      if (response.status < 200 || response.status >= 300) continue;
      if (((_b = (_a = response.json) == null ? void 0 : _a.data) == null ? void 0 : _b.settled) === true) {
        plugin.settings.pendingCheckout = null;
        await plugin.saveSettings();
        await syncPurchasedCharactersFromConstance(plugin);
        new import_obsidian2.Notice("Torbert: payment settled and your character balance was refreshed.", 5e3);
        return;
      }
    } catch (error) {
      console.warn("Torbert: checkout settlement poll failed", error);
    }
  }
}
async function startCheckout(plugin, planCode) {
  var _a, _b;
  if (!plugin.settings.billingAccessToken || !plugin.settings.billingAccountLinked) {
    new import_obsidian2.Notice("Sign in or create a billing account in Torbert settings before buying characters.");
    return;
  }
  const pending = ((_a = plugin.settings.pendingCheckout) == null ? void 0 : _a.planCode) === planCode ? plugin.settings.pendingCheckout : { idempotencyKey: `checkout_${generateEventId()}`, planCode };
  plugin.settings.pendingCheckout = pending;
  await plugin.saveSettings();
  const response = await (0, import_obsidian2.requestUrl)({
    url: `${BASE_URL}/api/v1/billing/checkout`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${plugin.settings.billingAccessToken}`,
      "Idempotency-Key": pending.idempotencyKey
    },
    body: JSON.stringify({ app_id: APP_ID, plan_code: planCode, installation_id: plugin.settings.constanceDeviceId, quantity: 1 }),
    throw: false
  });
  if (response.status === 401 || response.status === 403) {
    plugin.settings.billingAccessToken = "";
    plugin.settings.billingAccountLinked = false;
    plugin.settings.pendingCheckout = null;
    await plugin.saveSettings();
    new import_obsidian2.Notice("Torbert: your billing session expired. Sign in again.");
    return;
  }
  if (response.status < 200 || response.status >= 300) {
    new import_obsidian2.Notice(`Torbert: checkout could not be created (HTTP ${response.status}).`);
    return;
  }
  const data = (_b = response.json) == null ? void 0 : _b.data;
  const checkoutId = String((data == null ? void 0 : data.checkout_id) || (data == null ? void 0 : data.id) || "");
  const checkoutUrl = String((data == null ? void 0 : data.checkout_url) || "");
  if (!checkoutId || !checkoutUrl) {
    new import_obsidian2.Notice("Torbert: Constance returned an incomplete checkout response.");
    return;
  }
  plugin.settings.pendingCheckout = { ...pending, checkoutId };
  await plugin.saveSettings();
  window.open(checkoutUrl, "_blank");
  void pollCheckoutSettlement(plugin, checkoutId);
}
function resumePendingCheckout(plugin) {
  const pending = plugin.settings.pendingCheckout;
  if (!pending) return;
  if (pending.checkoutId) void pollCheckoutSettlement(plugin, pending.checkoutId);
  else void startCheckout(plugin, pending.planCode);
}
function openCheckout(plugin, tier) {
  void startCheckout(plugin, TORBERT_PLAN_CODES[tier]).catch((error) => {
    console.error("Torbert: authenticated checkout failed", error);
    new import_obsidian2.Notice("Torbert: checkout could not be started. Retry from settings.");
  });
}
function generateEventId() {
  const bytes = new Uint8Array(12);
  window.crypto.getRandomValues(bytes);
  return "evt_" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
async function fetchConstanceEntitlements(plugin) {
  var _a;
  const response = await (0, import_obsidian2.requestUrl)({
    url: `${BASE_URL}/api/v1/billing/entitlements/me?${new URLSearchParams({ app_id: APP_ID, installation_id: plugin.settings.constanceDeviceId }).toString()}`,
    method: "GET",
    headers: { Authorization: `Bearer ${plugin.settings.billingAccessToken}` },
    throw: false
  });
  if (response.status === 401 || response.status === 403 || response.status === 404) {
    plugin.settings.billingAccessToken = "";
    plugin.settings.billingAccountLinked = false;
    await plugin.saveSettings();
  }
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Entitlement sync failed: HTTP ${response.status}`);
  }
  return (_a = response.json) == null ? void 0 : _a.data;
}
async function checkCharactersAvailable(plugin, amount) {
  var _a, _b;
  if (!plugin.settings.billingAccessToken || !plugin.settings.billingAccountLinked) {
    new import_obsidian2.Notice("Torbert: sign in or create a billing account in plugin settings before running AI.");
    return false;
  }
  await retryPendingSpendEvents(plugin);
  if (plugin.settings.pendingSpendEvents.length > 0) {
    new import_obsidian2.Notice("Torbert: a previous credit spend is still being reconciled. No AI request was sent.");
    return false;
  }
  try {
    const entitlement = await fetchConstanceEntitlements(plugin);
    const freeRemaining = Math.max(0, Number((_a = entitlement == null ? void 0 : entitlement.free_usage) == null ? void 0 : _a.remaining) || 0);
    const purchasedBalance = Math.max(0, Number((_b = entitlement == null ? void 0 : entitlement.credits) == null ? void 0 : _b.balance) || 0);
    plugin.settings.freeCharacters = freeRemaining;
    plugin.settings.purchasedCharacters = purchasedBalance;
    await plugin.saveSettings();
    if (freeRemaining >= amount || purchasedBalance >= amount) return true;
    new import_obsidian2.Notice("Torbert: not enough free or purchased characters. No AI request was sent.");
    return false;
  } catch (e) {
    if (!plugin.settings.billingAccessToken || !plugin.settings.billingAccountLinked) {
      new import_obsidian2.Notice("Torbert: your billing session expired. Sign in again before running AI.");
    } else {
      new import_obsidian2.Notice("Torbert: billing could not be verified. No AI request was sent.");
    }
    return false;
  }
}
async function spendConstanceCredits(plugin, amount, stableEventId = generateEventId()) {
  const result = await spendAccountCredits(plugin.settings, APP_ID, plugin.settings.constanceDeviceId, stableEventId, amount);
  if (result.kind === "auth-required") {
    plugin.settings.billingAccessToken = "";
    plugin.settings.billingAccountLinked = false;
    await plugin.saveSettings();
    return { kind: "error" };
  }
  return result.kind === "ok" || result.kind === "insufficient" || result.kind === "error" ? result : { kind: "error" };
}
async function retryPendingSpendEvents(plugin) {
  var _a;
  for (const pending of [...(_a = plugin.settings.pendingSpendEvents) != null ? _a : []]) {
    const result = await spendConstanceCredits(plugin, pending.amount, pending.eventId);
    if (result.kind === "error") break;
    plugin.settings.pendingSpendEvents = plugin.settings.pendingSpendEvents.filter((item) => item.eventId !== pending.eventId);
    plugin.settings.purchasedCharacters = result.kind === "ok" ? result.balance : 0;
    await plugin.saveSettings();
  }
}
async function syncPurchasedCharactersFromConstance(plugin) {
  var _a;
  if (!plugin.settings.constanceDeviceId) {
    return;
  }
  try {
    if (!plugin.settings.billingAccessToken || !plugin.settings.billingAccountLinked) return;
    const entitlement = await fetchConstanceEntitlements(plugin);
    const serverBalance = (_a = entitlement == null ? void 0 : entitlement.credits) == null ? void 0 : _a.balance;
    plugin.settings.purchasedCharacters = Math.max(0, Number(serverBalance) || 0);
    await plugin.saveSettings();
  } catch (error) {
    console.error("Torbert: Constance entitlement sync failed", error);
  }
}

// src/transformations.ts
var escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
var parseKeywords = (keywords) => [...new Set(keywords.split(/[\n,]+/).map((keyword) => keyword.trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
var highlightKeywordsInText = (text, keywords) => {
  const parsedKeywords = parseKeywords(keywords);
  let count = 0;
  if (parsedKeywords.length === 0) {
    return { newText: text, count };
  }
  const keywordPattern = new RegExp(`(${parsedKeywords.map(escapeRegExp).join("|")})`, "gi");
  const newText = text.split("\n").map((line) => line.split(/(==.*?==)/g).map((part) => {
    if (part.startsWith("==") && part.endsWith("==")) {
      return part;
    }
    return part.replace(keywordPattern, (match) => {
      count++;
      return `==${match}==`;
    });
  }).join("")).join("\n");
  return { newText, count };
};
var countWords = (text) => {
  const matches = text.replace(/==/g, "").match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu);
  return matches ? matches.length : 0;
};
var READING_HIGHLIGHT_STOPWORDS = /* @__PURE__ */ new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "because",
  "been",
  "but",
  "by",
  "for",
  "from",
  "had",
  "has",
  "have",
  "he",
  "her",
  "him",
  "his",
  "i",
  "if",
  "in",
  "is",
  "it",
  "its",
  "itself",
  "me",
  "my",
  "not",
  "of",
  "on",
  "or",
  "our",
  "she",
  "so",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "they",
  "this",
  "to",
  "was",
  "we",
  "were",
  "what",
  "when",
  "where",
  "which",
  "who",
  "will",
  "with",
  "you",
  "your"
]);
var readingHighlightContent = (line) => line.trim().replace(/^(?:[-*+]|\d+[.)])\s+/, "").replace(/^\d{12,14}\s*(?:[-:]\s*)?/, "").trim();
var shouldSkipReadingHighlightLine = (line, inCodeBlock) => {
  const trimmed = line.trim();
  const content = readingHighlightContent(trimmed);
  const wordCount = countWords(content);
  return inCodeBlock || !trimmed || trimmed.startsWith("```") || trimmed.includes("==") || /^#{1,6}\s+/.test(trimmed) || trimmed.includes("|") || /^[-*_]{3,}$/.test(trimmed) || /^\[\d+\]:\s+/.test(trimmed) || /^>\s*\*\*[QA]:\*\*/.test(trimmed) || wordCount < 4 || wordCount <= 5 && !/^(?:[-*+]|\d+[.)])\s+/.test(trimmed) && !/\d{12,14}/.test(trimmed) && !/[.!?。！？]$/.test(trimmed);
};
var stripHighlights = (text) => text.replace(/==([^=\n]+)==/g, "$1");
var capReadingHighlights = (line, maxHighlights) => {
  let seen = 0;
  return line.replace(/==([^=\n]+)==/g, (_match, content) => {
    seen++;
    return seen <= maxHighlights ? `==${content}==` : content;
  });
};
var fallbackReadingHighlights = (line, maxHighlights) => {
  const content = readingHighlightContent(line);
  const candidates = [...content.matchAll(/[\p{L}][\p{L}\p{N}'-]*/gu)].map((match) => match[0]).filter((word) => word.length >= 3 && !READING_HIGHLIGHT_STOPWORDS.has(word.toLowerCase()));
  const selected = [...new Set(candidates)].slice(0, maxHighlights);
  if (selected.length === 0) {
    return line;
  }
  let highlighted = line;
  selected.sort((a, b) => b.length - a.length).forEach((word) => {
    highlighted = highlighted.replace(new RegExp(`(^|[^\\p{L}\\p{N}=])(${escapeRegExp(word)})(?=$|[^\\p{L}\\p{N}=])`, "u"), "$1==$2==");
  });
  return highlighted;
};
var sanitizeAiReadingHighlights = (originalText, aiText) => {
  const originalLines = originalText.split("\n");
  const aiLines = aiText.split("\n");
  let inCodeBlock = false;
  let changedCount = 0;
  const newLines = originalLines.map((originalLine, index) => {
    const aiLine = aiLines[index];
    const wasInCodeBlock = inCodeBlock;
    if (originalLine.trim().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
    }
    if (aiLine === void 0 || shouldSkipReadingHighlightLine(originalLine, wasInCodeBlock) || stripHighlights(aiLine) !== originalLine) {
      return originalLine;
    }
    const maxHighlights = countWords(readingHighlightContent(originalLine)) < 20 ? 3 : 5;
    const cappedLine = capReadingHighlights(aiLine, maxHighlights);
    const finalLine = cappedLine === originalLine ? fallbackReadingHighlights(originalLine, maxHighlights) : cappedLine;
    if (finalLine !== originalLine) {
      changedCount++;
    }
    return finalLine;
  });
  return {
    newText: newLines.join("\n"),
    changedCount
  };
};
var normalizeForSimilarity = (line) => line.toLowerCase().replace(/==/g, "").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
var jaccardSimilarity = (left, right) => {
  const leftTokens = new Set(normalizeForSimilarity(left).split(" ").filter(Boolean));
  const rightTokens = new Set(normalizeForSimilarity(right).split(" ").filter(Boolean));
  if (leftTokens.size === 0 && rightTokens.size === 0) {
    return 1;
  }
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = (/* @__PURE__ */ new Set([...leftTokens, ...rightTokens])).size;
  return union === 0 ? 0 : intersection / union;
};
var removeSimilarDuplicateLines = (text, threshold = 0.9) => {
  const keptLines = [];
  let removedCount = 0;
  text.split("\n").forEach((line) => {
    const normalizedLine = normalizeForSimilarity(line);
    if (!normalizedLine) {
      keptLines.push(line);
      return;
    }
    const isDuplicate = keptLines.some((keptLine) => {
      const normalizedKeptLine = normalizeForSimilarity(keptLine);
      return normalizedKeptLine && jaccardSimilarity(normalizedLine, normalizedKeptLine) >= threshold;
    });
    if (isDuplicate) {
      removedCount++;
    } else {
      keptLines.push(line);
    }
  });
  return { newText: keptLines.join("\n"), removedCount };
};
var fixMarkdownNumbering = (text) => {
  const counters = /* @__PURE__ */ new Map();
  return text.split("\n").map((line) => {
    if (/^\s*#{1,6}\s+/.test(line) || /^\s*$/.test(line)) {
      counters.clear();
      return line;
    }
    const match = line.match(/^(\s*)\d+[.)]\s+(.*)$/);
    if (!match) {
      return line;
    }
    const [, indent, content] = match;
    const indentLevel = indent.replace(/\t/g, "    ").length;
    const nextNumber = (counters.get(indentLevel) || 0) + 1;
    [...counters.keys()].filter((level) => level > indentLevel).forEach((level) => counters.delete(level));
    counters.set(indentLevel, nextNumber);
    return `${indent}${nextNumber}. ${content}`;
  }).join("\n");
};
var DELIMITED_SUMMARY_SEPARATOR = ":-:";
var hasDelimitedSummaryPrefix = (text) => {
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const separatorIndex = firstLine.indexOf(DELIMITED_SUMMARY_SEPARATOR);
  return separatorIndex > 0 && firstLine.slice(0, separatorIndex).trim().length > 0 && firstLine.slice(separatorIndex + DELIMITED_SUMMARY_SEPARATOR.length).trim().length > 0;
};
var addDelimitedSummaryPrefix = (text, summary) => {
  const cleanSummary = summary.trim().replace(/\s+/g, " ").replace(/:-:/g, "").trim();
  if (!cleanSummary || hasDelimitedSummaryPrefix(text)) {
    return text;
  }
  return `${cleanSummary} ${DELIMITED_SUMMARY_SEPARATOR} ${text.replace(/^\s+/, "")}`;
};
var removeDelimitedSummaryPrefix = (text) => {
  let removedCount = 0;
  const newText = text.split("\n").map((line) => {
    const match = line.match(/^(\s*(?:(?:[-*+]|\d+[.)])\s+)?)(.*?)\s*:-:\s*(.+)$/);
    if (!match || !match[2].trim() || !match[3].trim()) {
      return line;
    }
    removedCount++;
    return `${match[1]}${match[3]}`;
  }).join("\n");
  return { newText, removedCount };
};
var transformations = {
  boldToHighlight: {
    name: "Bold to Highlight",
    category: "Text Cleanup",
    transform: (text) => {
      let count = 0;
      return {
        newText: text.replace(/\*\*(.*?)\*\*/g, (_match, content) => {
          count++;
          return `==${content}==`;
        }),
        noticeText: count > 0 ? `Replaced ${count} instance(s).` : "No bold text found."
      };
    }
  },
  highlightKeywords: {
    name: "Highlight Keywords",
    category: "Text Cleanup",
    transform: (text, context) => {
      const { newText, count } = highlightKeywordsInText(text, context.settings.highlightKeywords);
      return {
        newText,
        noticeText: count > 0 ? `Highlighted ${count} keyword occurrence(s).` : "No keywords highlighted."
      };
    }
  },
  removeHighlights: {
    name: "Remove All Highlights",
    category: "Text Cleanup",
    transform: (text) => {
      let count = 0;
      return {
        newText: text.replace(/==([^=\n](?:.*?[^=\n])?)==/g, (_match, content) => {
          count++;
          return content;
        }),
        noticeText: count > 0 ? `Removed ${count} highlight(s).` : "No highlights found."
      };
    }
  },
  aiReadingKeywordHighlights: {
    name: "AI Reading Highlights",
    category: "AI",
    requiresAi: true,
    usesFullText: true,
    transform: async (text, context) => {
      const aiText = await highlightReadingKeywordsWithOpenAi(context.settings, text, context.abortSignal);
      const { newText, changedCount } = sanitizeAiReadingHighlights(text, aiText);
      return {
        newText,
        noticeText: changedCount > 0 ? `AI highlighted keywords in ${changedCount} line(s).` : "No safe lines found for AI keyword highlighting."
      };
    }
  },
  toTitleCase: {
    name: "Title Case",
    category: "Text Cleanup",
    transform: (text) => ({
      newText: text.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.substr(1).toLowerCase()),
      noticeText: "Converted to Title Case."
    })
  },
  toUpperCase: {
    name: "UPPERCASE",
    category: "Text Cleanup",
    transform: (text) => ({
      newText: text.toUpperCase(),
      noticeText: "Converted to UPPERCASE."
    })
  },
  toLowerCase: {
    name: "lowercase",
    category: "Text Cleanup",
    transform: (text) => ({
      newText: text.toLowerCase(),
      noticeText: "Converted to lowercase."
    })
  },
  toSentenceCase: {
    name: "Sentence Case",
    category: "Text Cleanup",
    transform: (text) => ({
      newText: text.toLowerCase().replace(/(^\s*\w|[.!?]\s*\w)/g, (letter) => letter.toUpperCase()),
      noticeText: "Converted to Sentence case."
    })
  },
  sortLinesAsc: {
    name: "Sort Lines A-Z",
    category: "Text Cleanup",
    transform: (text) => ({
      newText: text.split("\n").sort((a, b) => a.localeCompare(b)).join("\n"),
      noticeText: "Lines sorted alphabetically."
    })
  },
  sortLinesDesc: {
    name: "Sort Lines Z-A",
    category: "Text Cleanup",
    transform: (text) => ({
      newText: text.split("\n").sort((a, b) => b.localeCompare(a)).join("\n"),
      noticeText: "Lines sorted reverse-alphabetically."
    })
  },
  toggleCheckboxes: {
    name: "Toggle Checkboxes",
    category: "Markdown Notes",
    transform: (text) => {
      let count = 0;
      return {
        newText: text.replace(/(- \[ \])|(- \[x\])/g, (match) => {
          count++;
          return match === "- [ ]" ? "- [x]" : "- [ ]";
        }),
        noticeText: `Toggled ${count} checkbox(es).`
      };
    }
  },
  removeDuplicateLines: {
    name: "Remove Duplicate Lines",
    category: "Text Cleanup",
    transform: (text) => {
      const lines = text.split("\n");
      const uniqueLines = [...new Set(lines)];
      const removedCount = lines.length - uniqueLines.length;
      return {
        newText: uniqueLines.join("\n"),
        noticeText: `Removed ${removedCount} duplicate line(s).`
      };
    }
  },
  removeBlankLines: {
    name: "Remove Blank Lines",
    category: "Text Cleanup",
    transform: (text) => ({
      newText: text.replace(/^\s*[\r\n]/gm, ""),
      noticeText: "Removed blank lines."
    })
  },
  cleanExtraNewLines: {
    name: "Clean Extra Newlines",
    category: "Text Cleanup",
    transform: (text) => ({
      newText: text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/^\n+|\n+$/g, ""),
      noticeText: "Cleaned extra new lines."
    })
  },
  joinLines: {
    name: "Join Lines",
    category: "Markdown Notes",
    requiresSelection: true,
    transform: (text) => ({
      newText: text.replace(/\n/g, " "),
      noticeText: "Lines joined."
    })
  },
  trimWhitespace: {
    name: "Trim Whitespace",
    category: "Text Cleanup",
    transform: (text) => ({
      newText: text.split("\n").map((line) => line.trim()).join("\n"),
      noticeText: "Whitespace trimmed."
    })
  },
  increaseHeading: {
    name: "Increase Heading Level",
    category: "Markdown Notes",
    transform: (text) => ({
      newText: text.replace(/^(#+)/gm, "#$1"),
      noticeText: "Increased heading level."
    })
  },
  decreaseHeading: {
    name: "Decrease Heading Level",
    category: "Markdown Notes",
    transform: (text) => ({
      newText: text.replace(/^(##+)/gm, (heading) => heading.slice(1)),
      noticeText: "Decreased heading level."
    })
  },
  linesToBullets: {
    name: "Lines to Bullets",
    category: "Markdown Notes",
    transform: (text) => ({
      newText: text.split("\n").map((line) => line.trim() ? `- ${line}` : line).join("\n"),
      noticeText: "Converted to bullet list."
    })
  },
  listToNumbered: {
    name: "Bullets to Numbers",
    category: "Markdown Notes",
    transform: (text) => {
      let itemNumber = 1;
      return {
        newText: text.replace(/^(\s*)[-*+]\s/gm, (_match, indent) => `${indent}${itemNumber++}. `),
        noticeText: "Converted to numbered list."
      };
    }
  },
  fixMarkdownNumbering: {
    name: "Fix Numbering",
    category: "Markdown Notes",
    transform: (text) => ({
      newText: fixMarkdownNumbering(text),
      noticeText: "Fixed Markdown numbering."
    })
  },
  removeSimilarDuplicateLines: {
    name: "Remove Similar Lines",
    category: "Text Cleanup",
    transform: (text) => {
      const { newText, removedCount } = removeSimilarDuplicateLines(text);
      return {
        newText,
        noticeText: `Removed ${removedCount} similar duplicate line(s).`
      };
    }
  },
  markdownStructureCleanup: {
    name: "Clean Markdown Structure",
    category: "Markdown Notes",
    transform: (text) => ({
      newText: cleanupMarkdownStructure(text),
      noticeText: "Cleaned Markdown structure."
    })
  },
  extractActionItems: {
    name: "Extract Actions",
    category: "Markdown Notes",
    transform: (text) => {
      const { newText, count } = applyActionItemsSection(text);
      return {
        newText,
        noticeText: count > 0 ? `Extracted ${count} action item(s).` : "Added an Action Items section."
      };
    }
  },
  extractUrls: {
    name: "Extract URLs",
    category: "Markdown Notes",
    transform: (text) => {
      const urls = text.match(/https?:\/\/[^\s/$.?#].[^\s]*/gi) || [];
      return {
        newText: urls.join("\n"),
        noticeText: `Extracted ${urls.length} URL(s).`
      };
    }
  },
  aiAddDelimitedSummaryPrefix: {
    name: "AI Summary Prefix",
    category: "AI",
    requiresAi: true,
    transform: async (text, context) => {
      if (hasDelimitedSummaryPrefix(text)) {
        return {
          newText: text,
          noticeText: "Delimited summary prefix already present."
        };
      }
      const summary = await generateDelimitedSummaryPrefix(context.settings, text, context.abortSignal);
      return {
        newText: addDelimitedSummaryPrefix(text, summary),
        noticeText: summary ? "AI added delimited summary prefix." : "AI did not return a summary prefix."
      };
    }
  },
  removeDelimitedSummaryPrefix: {
    name: "Remove AI Summary Prefix",
    category: "AI",
    transform: (text) => {
      const result = removeDelimitedSummaryPrefix(text);
      return {
        newText: result.newText,
        noticeText: result.removedCount > 0 ? `Removed ${result.removedCount} delimited summary prefix(es).` : "No delimited summary prefix found."
      };
    }
  },
  slugify: {
    name: "Slugify",
    category: "Text Cleanup",
    transform: (text) => ({
      newText: text.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, ""),
      noticeText: "Slugified text."
    })
  },
  toStraightQuotes: {
    name: "Straight Quotes",
    category: "Text Cleanup",
    transform: (text) => ({
      newText: text.replace(/[“”]/g, '"').replace(/[‘’]/g, "'"),
      noticeText: "Converted to straight quotes."
    })
  },
  urlEncode: {
    name: "URL Encode",
    category: "Text Cleanup",
    requiresSelection: true,
    transform: (text) => ({
      newText: encodeURIComponent(text),
      noticeText: "URL Encoded."
    })
  },
  urlDecode: {
    name: "URL Decode",
    category: "Text Cleanup",
    requiresSelection: true,
    transform: (text) => {
      try {
        return {
          newText: decodeURIComponent(text),
          noticeText: "URL Decoded."
        };
      } catch (e) {
        return {
          newText: text,
          noticeText: "Error: Invalid URI sequence."
        };
      }
    }
  },
  aiNoteSummary: {
    name: "AI Note Summary",
    category: "AI",
    requiresAi: true,
    transform: async (text, context) => ({
      newText: applySummary(text, await generateSummaryFromContent(context.settings, text, context.abortSignal)),
      noticeText: "AI created or updated note summary."
    })
  }
};

// src/settings.ts
var DEFAULT_SETTINGS = {
  showRibbonIcon: true,
  showContextMenuSingle: true,
  showContextMenuSubmenu: true,
  enableLogging: false,
  enableTracking: false,
  openAiApiKey: "",
  openAiApiBase: "https://openrouter.ai/api/v1",
  openAiModel: "~deepseek/deepseek-v4-flash-latest",
  largeContentOpenAiModel: "~deepseek/deepseek-v4-flash-latest",
  highlightKeywords: "",
  folderClassificationFolders: "Jobs\nClients\nDevOps\nFinance",
  customPromptPresets: [
    {
      name: "Job Search cleanup",
      prompt: "Clean up this job-search note. Preserve facts, company names, roles, deadlines, links, and contact details. Improve headings, bullets, action items, and searchability."
    },
    {
      name: "DevOps note cleanup",
      prompt: "Clean up this DevOps note. Preserve commands, IPs, ports, credentials references, paths, logs, and runbook sequence. Improve headings, bullets, and operational clarity."
    },
    {
      name: "Client CRM cleanup",
      prompt: "Clean up this client CRM note. Preserve names, organizations, emails, phone numbers, commitments, dates, and next steps. Improve structure and action items."
    }
  ],
  operationHistory: [],
  enabledTransformations: Object.keys(transformations).reduce(
    (enabledTransformations, transformationId) => ({
      ...enabledTransformations,
      [transformationId]: true
    }),
    {}
  ),
  constanceDeviceId: "",
  billingEmail: "",
  billingAccessToken: "",
  billingAccountLinked: false,
  freeCharacters: 0,
  purchasedCharacters: 0,
  pendingSpendEvents: [],
  pendingCheckout: null,
  reviewBeforeApply: false
};

// src/settings-tab.ts
var import_obsidian3 = require("obsidian");
var TRANSFORMATION_CATEGORY_ORDER = [
  "AI",
  "Text Cleanup",
  "Markdown Notes"
];
var TorbertTextAiSettingTab = class extends import_obsidian3.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    __publicField(this, "plugin", plugin);
    __publicField(this, "creditsSummaryEl", null);
  }
  renderCreditsSummary() {
    if (!this.creditsSummaryEl) {
      return;
    }
    const { freeCharacters, purchasedCharacters } = this.plugin.settings;
    const totalChars = freeCharacters + purchasedCharacters;
    this.creditsSummaryEl.setText(
      `Characters remaining: ${totalChars.toLocaleString()} (${freeCharacters.toLocaleString()} free + ${purchasedCharacters.toLocaleString()} purchased)`
    );
  }
  /** Render the quick-start settings first and keep advanced controls grouped below. */
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Torbert Text AI Settings" });
    new import_obsidian3.Setting(containerEl).setName("Getting started").setHeading();
    containerEl.createEl("p", {
      text: "Non-AI transformations stay inside this vault. AI transformations are optional and send the selected text or note content to OpenRouter when you run them. An API key is optional when Torbert's built-in service is available. Note and folder edits apply when launched; the latest applied change can be restored from the command palette. Every transformation is also searchable in the command palette under Torbert Text AI."
    });
    new import_obsidian3.Setting(containerEl).setName("Review before applying").setDesc("Off by default for one-click edits. Turn on to review before/after changes for notes, folders, and AI moves.").addToggle((toggle) => toggle.setValue(this.plugin.settings.reviewBeforeApply).onChange(async (value) => {
      this.plugin.settings.reviewBeforeApply = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian3.Setting(containerEl).setName("Billing").setHeading();
    containerEl.createEl("p", {
      text: "AI usage is metered by input characters. Each billing account gets a one-time 2,000-character starter allowance across linked installations; buy one-time character packs below when you run out."
    });
    this.creditsSummaryEl = containerEl.createEl("p", { cls: "torbert-credits-summary" });
    this.renderCreditsSummary();
    addBillingAccountSettings(containerEl, { state: this.plugin.settings, appId: "torbert-text-ai-obsidian", installationId: this.plugin.settings.constanceDeviceId, appVersion: this.plugin.manifest.version, persist: () => this.plugin.saveSettings(), syncBalance: () => syncPurchasedCharactersFromConstance(this.plugin), refresh: () => this.display() });
    const buySetting = new import_obsidian3.Setting(containerEl).setName("Buy characters").setDesc("Opens secure checkout on app.tutivsoft.com for a one-time character pack. Credits apply to this device's balance after payment.");
    buySetting.addButton((button) => button.setButtonText("Buy $1 (20,000 characters)").onClick(() => openCheckout(this.plugin, "usd_001")));
    buySetting.addButton((button) => button.setButtonText("Buy $5 (160,000 characters)").setCta().onClick(() => openCheckout(this.plugin, "usd_005")));
    buySetting.addButton((button) => button.setButtonText("Buy $15 (640,000 characters)").onClick(() => openCheckout(this.plugin, "usd_015")));
    new import_obsidian3.Setting(containerEl).setName("Refresh balance").setDesc("Pull the latest purchased-character balance from Constance.").addButton(
      (button) => button.setButtonText("Refresh balance").onClick(async () => {
        button.setDisabled(true);
        button.setButtonText("Refreshing...");
        await syncPurchasedCharactersFromConstance(this.plugin);
        this.renderCreditsSummary();
        button.setDisabled(false);
        button.setButtonText("Refresh balance");
      })
    );
    void syncPurchasedCharactersFromConstance(this.plugin).then(() => this.renderCreditsSummary());
    new import_obsidian3.Setting(containerEl).setName("Menus and toolbar").setHeading();
    new import_obsidian3.Setting(containerEl).setName("Show Ribbon Icon").setDesc('Toggle the visibility of the "Bold to Highlight" icon in the left ribbon bar. You may need to reload Obsidian for this to take effect.').addToggle((toggle) => toggle.setValue(this.plugin.settings.showRibbonIcon).onChange(async (value) => {
      this.plugin.settings.showRibbonIcon = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian3.Setting(containerEl).setName('Show "Bold to Highlight" in context menu').setDesc('Show the primary "Torbert Bold to Highlight" command at the top level of the right-click context menu.').addToggle((toggle) => toggle.setValue(this.plugin.settings.showContextMenuSingle).onChange(async (value) => {
      this.plugin.settings.showContextMenuSingle = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian3.Setting(containerEl).setName('Show "Torbert Text AI" submenu').setDesc("Show the submenu containing all text transformations in the right-click context menu.").addToggle((toggle) => toggle.setValue(this.plugin.settings.showContextMenuSubmenu).onChange(async (value) => {
      this.plugin.settings.showContextMenuSubmenu = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian3.Setting(containerEl).setName("Privacy & diagnostics").setHeading();
    containerEl.createEl("p", {
      text: "Torbert has no analytics or advertising. On startup it checks this install's purchased-character balance with TutivSoft. Debug logging is separate and off by default."
    });
    new import_obsidian3.Setting(containerEl).setName("Enable debug logging").setDesc('Off by default. When enabled, writes operation details such as file paths and AI usage to "plugin.log" in the plugin directory for troubleshooting.').addToggle((toggle) => toggle.setValue(this.plugin.settings.enableLogging).onChange(async (value) => {
      this.plugin.settings.enableLogging = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian3.Setting(containerEl).setName("AI features").setHeading();
    new import_obsidian3.Setting(containerEl).setName("Provider").setHeading();
    new import_obsidian3.Setting(containerEl).setName("OpenRouter API key").setDesc("Optional personal override. Torbert loads its own capped key automatically when this is blank; AI actions still send note text to OpenRouter.").addText((text) => text.setPlaceholder("sk-...").setValue(this.plugin.settings.openAiApiKey).onChange(async (value) => {
      this.plugin.settings.openAiApiKey = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian3.Setting(containerEl).setName("OpenRouter model").setDesc("Model used by AI transformations.").addText((text) => text.setPlaceholder("openai/gpt-5-mini").setValue(this.plugin.settings.openAiModel).onChange(async (value) => {
      this.plugin.settings.openAiModel = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian3.Setting(containerEl).setName("Large-content OpenRouter model").setDesc("Model used by AI transformations that need to inspect whole or larger note text.").addText((text) => text.setPlaceholder("openai/gpt-5-mini").setValue(this.plugin.settings.largeContentOpenAiModel).onChange(async (value) => {
      this.plugin.settings.largeContentOpenAiModel = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian3.Setting(containerEl).setName("Keyword Highlighting").setHeading();
    new import_obsidian3.Setting(containerEl).setName("Keywords").setDesc("Comma-separated or newline-separated keywords to wrap with Obsidian highlights.").addTextArea((text) => text.setPlaceholder("important, urgent, follow up").setValue(this.plugin.settings.highlightKeywords).onChange(async (value) => {
      this.plugin.settings.highlightKeywords = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian3.Setting(containerEl).setName("AI classification folders").setDesc("Newline- or comma-separated folder names for AI Folder Classification.").addTextArea((text) => text.setPlaceholder("Jobs\nClients\nDevOps\nFinance").setValue(this.plugin.settings.folderClassificationFolders).onChange(async (value) => {
      this.plugin.settings.folderClassificationFolders = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian3.Setting(containerEl).setName("Custom prompt presets").setDesc('JSON array of named prompts. Example: [{"name":"Job Search cleanup","prompt":"Clean this note..."}]').addTextArea((text) => text.setPlaceholder('[{"name":"Job Search cleanup","prompt":"Clean this note..."}]').setValue(JSON.stringify(this.plugin.settings.customPromptPresets, null, 2)).onChange(async (value) => {
      try {
        const parsed = JSON.parse(value);
        this.plugin.settings.customPromptPresets = parsed.map((preset) => ({
          name: String(preset.name || "").trim(),
          prompt: String(preset.prompt || "").trim()
        })).filter((preset) => preset.name && preset.prompt);
        await this.plugin.saveSettings();
      } catch (e) {
      }
    }));
    new import_obsidian3.Setting(containerEl).setName("Transformation menu").setDesc('Choose which transformations appear in the "Torbert Text AI" context submenu. Command-palette entries remain available.').setHeading();
    TRANSFORMATION_CATEGORY_ORDER.forEach((category) => {
      const categoryTransformations = Object.entries(transformations).filter(([, transformation]) => (transformation.category || "Text Cleanup") === category);
      if (categoryTransformations.length === 0) {
        return;
      }
      new import_obsidian3.Setting(containerEl).setName(category).setHeading();
      categoryTransformations.forEach(([transformationId, transformation]) => {
        new import_obsidian3.Setting(containerEl).setName(transformation.name).addToggle((toggle) => {
          var _a;
          return toggle.setValue((_a = this.plugin.settings.enabledTransformations[transformationId]) != null ? _a : true).onChange(async (value) => {
            this.plugin.settings.enabledTransformations[transformationId] = value;
            await this.plugin.saveSettings();
          });
        });
      });
    });
  }
};

// src/plugin-support.ts
var import_obsidian4 = require("obsidian");
function safeDetail(value) {
  if (value instanceof Error) return value.stack || value.message;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch (e) {
    return String(value);
  }
}
var DocumentationModal = class extends import_obsidian4.Modal {
  constructor(app, docs) {
    super(app);
    __publicField(this, "docs", docs);
  }
  onOpen() {
    this.titleEl.setText(`${this.docs.name} documentation`);
    this.contentEl.createEl("p", { text: this.docs.summary });
    const addSection = (title, items) => {
      this.contentEl.createEl("h3", { text: title });
      const list = this.contentEl.createEl("ol");
      for (const item of items) list.createEl("li", { text: item });
    };
    addSection("Quick start", this.docs.quickStart);
    addSection("Useful commands", this.docs.commands);
    addSection("Troubleshooting", this.docs.troubleshooting);
  }
  onClose() {
    this.contentEl.empty();
  }
};
var PluginSupport = class {
  constructor(plugin, docs) {
    __publicField(this, "plugin", plugin);
    __publicField(this, "docs", docs);
    __publicField(this, "entries", []);
    __publicField(this, "maxEntries", 250);
  }
  start() {
    this.info("plugin.loaded", `version=${this.plugin.manifest.version}`);
    this.plugin.registerDomEvent(window, "error", (event) => {
      this.error("runtime.error", event.error || event.message);
    });
    this.plugin.registerDomEvent(window, "unhandledrejection", (event) => {
      this.error("runtime.unhandled_rejection", event.reason);
    });
    this.plugin.addCommand({
      id: "open-documentation",
      name: "Open documentation",
      callback: () => new DocumentationModal(this.plugin.app, this.docs).open()
    });
    this.plugin.addCommand({
      id: "copy-debug-log",
      name: "Copy debug log",
      callback: () => {
        void this.copyDiagnostics();
      }
    });
    this.plugin.addCommand({
      id: "open-plugin-settings",
      name: "Open plugin settings",
      callback: () => {
        const setting = this.plugin.app.setting;
        setting == null ? void 0 : setting.open();
        setting == null ? void 0 : setting.openTabById(this.plugin.manifest.id);
      }
    });
  }
  info(event, detail) {
    this.record("info", event, detail);
  }
  warn(event, detail) {
    this.record("warn", event, detail);
  }
  error(event, detail) {
    this.record("error", event, detail);
  }
  record(level, event, detail) {
    const entry = { at: (/* @__PURE__ */ new Date()).toISOString(), level, event };
    if (detail !== void 0) entry.detail = safeDetail(detail).slice(0, 4e3);
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) this.entries.splice(0, this.entries.length - this.maxEntries);
    const method = level === "error" ? console.error : level === "warn" ? console.warn : console.info;
    method.call(console, `[${this.docs.name}] ${event}`, detail != null ? detail : "");
  }
  async copyDiagnostics() {
    const header = [
      `Plugin: ${this.docs.name}`,
      `Plugin ID: ${this.plugin.manifest.id}`,
      `Version: ${this.plugin.manifest.version}`,
      `Captured: ${(/* @__PURE__ */ new Date()).toISOString()}`,
      `User agent: ${navigator.userAgent}`,
      ""
    ];
    try {
      await navigator.clipboard.writeText(header.concat(this.entries.map(
        (entry) => `${entry.at} [${entry.level.toUpperCase()}] ${entry.event}${entry.detail ? ` \u2014 ${entry.detail}` : ""}`
      )).join("\n"));
      new import_obsidian4.Notice(`${this.docs.name}: debug log copied. Secrets and note contents are not included.`);
    } catch (error) {
      this.error("diagnostics.copy_failed", error);
      new import_obsidian4.Notice(`${this.docs.name}: could not copy the debug log.`);
    }
  }
};

// src/main.ts
var GENERATED_REPORT_FOLDER_NAME = "Torbert Reports";
var TRANSFORMATION_CATEGORY_ORDER2 = [
  "AI",
  "Text Cleanup",
  "Markdown Notes"
];
function summarizeTextChange(before, after) {
  const beforeLines = before.split(/\r?\n/);
  const afterLines = after.split(/\r?\n/);
  let firstDifferent = 0;
  while (firstDifferent < beforeLines.length && firstDifferent < afterLines.length && beforeLines[firstDifferent] === afterLines[firstDifferent]) {
    firstDifferent++;
  }
  let lastBefore = beforeLines.length - 1;
  let lastAfter = afterLines.length - 1;
  while (lastBefore >= firstDifferent && lastAfter >= firstDifferent && beforeLines[lastBefore] === afterLines[lastAfter]) {
    lastBefore--;
    lastAfter--;
  }
  const start = Math.max(0, firstDifferent - 2);
  const lines = [`Before (${beforeLines.length} line(s)):`];
  if (start > 0) {
    lines.push("  \u2026");
  }
  lines.push(...beforeLines.slice(start, lastBefore + 1).map((line) => `- ${line}`));
  if (lastBefore + 1 < beforeLines.length) {
    lines.push("  \u2026");
  }
  lines.push(`After (${afterLines.length} line(s)):`);
  if (start > 0) {
    lines.push("  \u2026");
  }
  lines.push(...afterLines.slice(start, lastAfter + 1).map((line) => `+ ${line}`));
  if (lastAfter + 1 < afterLines.length) {
    lines.push("  \u2026");
  }
  return lines.join("\n");
}
var BatchPreviewModal = class extends import_obsidian5.Modal {
  constructor(app, _title, _items, onApply) {
    super(app);
    __publicField(this, "onApply", onApply);
  }
  open() {
    this.onApply();
  }
};
var TorbertTextAiPlugin = class extends import_obsidian5.Plugin {
  constructor() {
    super(...arguments);
    __publicField(this, "support");
    __publicField(this, "settings");
    __publicField(this, "logger");
  }
  async onload() {
    this.support = new PluginSupport(this, { name: "Torbert Text AI", summary: "Transform, summarize, organize, and clean Markdown text.", quickStart: ["Sign in to billing in Settings.", "Select text or open a note.", "Choose a Torbert transformation; it applies automatically and can be undone."], commands: ["Open transformations", "Undo last operation", "Copy debug log"], troubleshooting: ["Use Copy debug log before reporting a problem.", "Confirm the current note is Markdown and editable."] });
    this.support.start();
    try {
      const logFilePath = `${this.manifest.dir || "."}/plugin.log`;
      this.logger = new FileLogger(this.app.vault.adapter, logFilePath);
      await this.loadSettings();
      if (!this.settings.constanceDeviceId) {
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        this.settings.constanceDeviceId = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
        await this.saveSettings();
      }
      this.settings.pendingSpendEvents = Array.isArray(this.settings.pendingSpendEvents) ? this.settings.pendingSpendEvents.filter((item) => item && typeof item.eventId === "string" && Number.isInteger(item.amount) && item.amount > 0) : [];
      const pendingCheckout = this.settings.pendingCheckout;
      this.settings.pendingCheckout = pendingCheckout && typeof pendingCheckout.idempotencyKey === "string" && typeof pendingCheckout.planCode === "string" ? pendingCheckout : null;
      await this.saveSettings();
      this.logger.setEnabled(this.settings.enableLogging);
      this.logger.info("Plugin.onload", "Plugin is loading.");
      void syncPurchasedCharactersFromConstance(this).then(() => retryPendingSpendEvents(this));
      resumePendingCheckout(this);
      if (this.settings.showRibbonIcon) {
        this.addRibbonIcon("wand", "Replace bold with highlight", () => this.applyTransformationToEditor(null, "boldToHighlight"));
      }
      this.addCommand({
        id: "replace-bold-with-highlight",
        name: "Text Cleanup / Bold to Highlight",
        editorCallback: (editor) => this.applyTransformationToEditor(editor, "boldToHighlight")
      });
      this.addCommand({
        id: "restore-last-torbert-change",
        name: "Restore last change",
        callback: () => {
          void this.restoreLastOperation();
        }
      });
      this.registerTransformationCommands();
      const addTransformationMenuItems = (menu, target) => {
        const showQuickBold = this.settings.showContextMenuSingle && this.settings.enabledTransformations.boldToHighlight;
        if (showQuickBold) {
          menu.addItem((item) => {
            item.setTitle("Torbert: Bold to Highlight").setIcon("wand").onClick(() => {
              if (target instanceof import_obsidian5.TFolder) {
                void this.applyTransformationToFolder(target, "boldToHighlight");
              } else if (target instanceof import_obsidian5.TFile) {
                void this.applyTransformationToFile(target, "boldToHighlight");
              } else {
                void this.applyTransformationToEditor(target, "boldToHighlight");
              }
            });
          });
        }
        if (this.settings.showContextMenuSubmenu) {
          const enabledTransformations = Object.entries(transformations).filter(([transformationId]) => this.settings.enabledTransformations[transformationId]).filter(([transformationId]) => !(showQuickBold && transformationId === "boldToHighlight"));
          if (enabledTransformations.length > 0) {
            menu.addItem((item) => {
              item.setTitle("Torbert Text AI").setIcon("brain-circuit");
              const submenu = item.setSubmenu();
              TRANSFORMATION_CATEGORY_ORDER2.map((category) => [
                category,
                enabledTransformations.filter(([, transformation]) => (transformation.category || "Text Cleanup") === category)
              ]).forEach(([category, transformationsForCategory]) => {
                const hasFileActions = category === "AI" && (target instanceof import_obsidian5.TFile || target instanceof import_obsidian5.TFolder);
                const hasFolderReports = category === "Markdown Notes" && target instanceof import_obsidian5.TFolder;
                const hasRestoreAction = category === "Markdown Notes";
                if (transformationsForCategory.length === 0 && !hasFileActions && !hasFolderReports && !hasRestoreAction) {
                  return;
                }
                submenu.addItem((categoryItem) => {
                  categoryItem.setTitle(category);
                  const categoryMenu = categoryItem.setSubmenu();
                  if (hasFileActions) {
                    categoryMenu.addItem((submenuItem) => {
                      submenuItem.setTitle("Classify folder").onClick(() => {
                        if (target instanceof import_obsidian5.TFolder) {
                          void this.classifyFilesInFolder(target);
                        } else {
                          void this.classifyFile(target);
                        }
                      });
                    });
                  }
                  transformationsForCategory.forEach(([transformationId, transformation]) => {
                    categoryMenu.addItem((submenuItem) => {
                      submenuItem.setTitle(this.getTransformationMenuTitle(transformation)).onClick(() => {
                        if (target instanceof import_obsidian5.TFolder) {
                          void this.applyTransformationToFolder(target, transformationId);
                        } else if (target instanceof import_obsidian5.TFile) {
                          void this.applyTransformationToFile(target, transformationId);
                        } else {
                          void this.applyTransformationToEditor(target, transformationId);
                        }
                      });
                    });
                  });
                  if (category === "AI" && (target instanceof import_obsidian5.TFile || target instanceof import_obsidian5.TFolder)) {
                    const presets = this.getCustomPromptPresets();
                    if (presets.length > 0) {
                      categoryMenu.addSeparator();
                      categoryMenu.addItem((presetGroup) => {
                        presetGroup.setTitle("Saved prompt presets");
                        const presetMenu = presetGroup.setSubmenu();
                        presets.forEach((preset) => {
                          presetMenu.addItem((submenuItem) => {
                            submenuItem.setTitle(preset.name).onClick(() => {
                              if (target instanceof import_obsidian5.TFolder) {
                                void this.applyCustomPromptToFolder(target, preset);
                              } else {
                                void this.applyCustomPromptToFile(target, preset);
                              }
                            });
                          });
                        });
                      });
                    }
                  }
                  if (category === "Markdown Notes" && target instanceof import_obsidian5.TFolder) {
                    categoryMenu.addItem((submenuItem) => {
                      submenuItem.setTitle("Find Weak Titles").onClick(() => {
                        void this.createWeakTitlesReport(target);
                      });
                    });
                    categoryMenu.addItem((submenuItem) => {
                      submenuItem.setTitle("Find Duplicate Notes").onClick(() => {
                        void this.createDuplicateNotesReport(target);
                      });
                    });
                  }
                  if (category === "Markdown Notes") {
                    categoryMenu.addItem((submenuItem) => {
                      submenuItem.setTitle("Restore Last Change").onClick(() => {
                        void this.restoreLastOperation();
                      });
                    });
                  }
                });
              });
            });
          }
        }
      };
      this.registerEvent(this.app.workspace.on("editor-menu", (menu, editor) => addTransformationMenuItems(menu, editor)));
      this.registerEvent(this.app.workspace.on("file-menu", (menu, file) => {
        if (file instanceof import_obsidian5.TFile && file.extension === "md") {
          addTransformationMenuItems(menu, file);
        } else if (file instanceof import_obsidian5.TFolder) {
          addTransformationMenuItems(menu, file);
        }
      }));
      this.addSettingTab(new TorbertTextAiSettingTab(this.app, this));
      this.logger.info("Plugin.onload", "Plugin has loaded successfully.");
    } catch (error) {
      console.error("Torbert Text AI failed to load:", error);
      new import_obsidian5.Notice("Torbert Text AI could not load. Check the developer console.");
    }
  }
  /** Register every transformation in the command palette using category/name labels. */
  registerTransformationCommands() {
    Object.entries(transformations).forEach(([transformationId, transformation]) => {
      if (transformationId === "boldToHighlight") {
        return;
      }
      const category = transformation.category || "Text Cleanup";
      this.addCommand({
        id: `transform-${transformationId}`,
        name: `${category} / ${this.friendlyTransformationName(transformation.name)}`,
        editorCallback: (editor) => {
          void this.applyTransformationToEditor(editor, transformationId);
        }
      });
    });
    this.addCommand({
      id: "ai-classify-current-note",
      name: "AI / Classify current note folder",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!(file instanceof import_obsidian5.TFile) || file.extension !== "md") {
          return false;
        }
        if (!checking) {
          void this.classifyFile(file);
        }
        return true;
      }
    });
    this.addCommand({
      id: "report-weak-titles-current-folder",
      name: "Markdown Notes / Find weak titles in current folder",
      checkCallback: (checking) => {
        var _a;
        const folder = (_a = this.app.workspace.getActiveFile()) == null ? void 0 : _a.parent;
        if (!(folder instanceof import_obsidian5.TFolder)) {
          return false;
        }
        if (!checking) {
          void this.createWeakTitlesReport(folder);
        }
        return true;
      }
    });
    this.addCommand({
      id: "report-duplicate-notes-current-folder",
      name: "Markdown Notes / Find duplicate notes in current folder",
      checkCallback: (checking) => {
        var _a;
        const folder = (_a = this.app.workspace.getActiveFile()) == null ? void 0 : _a.parent;
        if (!(folder instanceof import_obsidian5.TFolder)) {
          return false;
        }
        if (!checking) {
          void this.createDuplicateNotesReport(folder);
        }
        return true;
      }
    });
  }
  onunload() {
    this.logger.info("Plugin.onunload", "Plugin is unloading.");
  }
  startProcessingNotice(label) {
    const startedAt = Date.now();
    const abortController = new AbortController();
    let cancelled = false;
    const fragment = document.createDocumentFragment();
    const message = document.createElement("span");
    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.textContent = "Cancel";
    cancelButton.style.marginLeft = "10px";
    cancelButton.onclick = () => {
      cancelled = true;
      abortController.abort();
      message.textContent = `${label} cancelled.`;
    };
    fragment.append(message, cancelButton);
    const notice = new import_obsidian5.Notice(fragment, 0);
    const update = () => {
      const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1e3));
      message.textContent = `${label}... ${elapsedSeconds} second(s) elapsed.`;
    };
    update();
    const intervalId = window.setInterval(update, 1e3);
    return {
      abortSignal: abortController.signal,
      throwIfCancelled: () => {
        if (cancelled || abortController.signal.aborted) {
          throw new Error("Operation cancelled.");
        }
      },
      wasCancelled: () => cancelled || abortController.signal.aborted,
      close: () => {
        window.clearInterval(intervalId);
        notice.hide();
      }
    };
  }
  friendlyTransformationName(name) {
    return name.replace(/^AI /, "").replace(/^Remove AI /, "Remove ");
  }
  getTransformationMenuTitle(transformation) {
    return `${this.friendlyTransformationName(transformation.name)}${transformation.usesFullText ? " (Full Text)" : ""}`;
  }
  formatCompactNumber(value) {
    if (value >= 1e6) {
      return `${(value / 1e6).toFixed(value >= 1e7 ? 0 : 1)}M`;
    }
    if (value >= 1e3) {
      return `${(value / 1e3).toFixed(value >= 1e4 ? 0 : 1)}K`;
    }
    return String(value);
  }
  formatAiUsage(usage) {
    const tokenText = usage.totalTokens > 0 ? this.formatCompactNumber(usage.totalTokens) : "unknown";
    const requestText = usage.requests === 1 ? "1 request" : `${usage.requests} requests`;
    return `Tokens: ${tokenText} (${requestText}, ${this.formatCompactNumber(usage.inputChars)} chars in, ${this.formatCompactNumber(usage.outputChars)} chars out)`;
  }
  showAiUsage(label, usage) {
    if (usage.requests === 0) {
      return;
    }
    const message = `${label}. ${this.formatAiUsage(usage)}`;
    new import_obsidian5.Notice(message, 3e3);
    this.logger.info("AI usage", message, usage);
    if (usage.inputChars > 1e3) {
      const ratio = usage.inputChars > 0 ? usage.outputChars / usage.inputChars : 1;
      if (ratio < 0.55 || ratio > 1.8) {
        this.logger.warn("AI usage", `Suspicious character delta for ${label}. inputChars=${usage.inputChars} outputChars=${usage.outputChars} ratio=${ratio.toFixed(3)}`);
      }
    }
  }
  /**
   * Charges input characters for a single AI call (minimum one). Claims the
   * account free allowance first, then spends purchased characters. Returns false
   * (and shows a Notice) when authentication, balance, or spend verification
   * is unavailable. AI work never proceeds without an authoritative charge.
   */
  async chargeCharacters(charCount) {
    const cost = Math.max(1, Math.ceil(charCount));
    if (!this.settings.billingAccessToken || !this.settings.billingAccountLinked) {
      new import_obsidian5.Notice("Torbert: sign in or create a billing account in plugin settings before running AI.");
      return false;
    }
    const free = await claimAccountFreeUsage(this.settings, "torbert-text-ai-obsidian", this.settings.constanceDeviceId, `free_${generateEventId()}`, cost);
    if (free.kind === "ok") {
      this.settings.freeCharacters = free.remaining;
      await this.saveSettings();
      return true;
    }
    if (free.kind === "auth-required") {
      this.settings.billingAccessToken = "";
      this.settings.billingAccountLinked = false;
      await this.saveSettings();
      new import_obsidian5.Notice("Torbert: your billing session expired. Sign in again.");
      return false;
    }
    if (free.kind === "error") {
      new import_obsidian5.Notice("Torbert: the account allowance could not be verified. No AI request was sent.");
      return false;
    }
    await retryPendingSpendEvents(this);
    if (this.settings.pendingSpendEvents.length > 0) {
      new import_obsidian5.Notice("Torbert: a previous credit spend is still being reconciled. Please retry when the connection is restored.");
      return false;
    }
    const stableEventId = generateEventId();
    this.settings.pendingSpendEvents.push({ eventId: stableEventId, amount: cost });
    await this.saveSettings();
    const result = await spendConstanceCredits(this, cost, stableEventId);
    if (result.kind === "ok") {
      this.settings.purchasedCharacters = result.balance;
      this.settings.pendingSpendEvents = this.settings.pendingSpendEvents.filter((item) => item.eventId !== stableEventId);
      await this.saveSettings();
      return true;
    }
    if (result.kind === "insufficient") {
      this.settings.purchasedCharacters = 0;
      this.settings.pendingSpendEvents = this.settings.pendingSpendEvents.filter((item) => item.eventId !== stableEventId);
      await this.saveSettings();
      new import_obsidian5.Notice("Torbert: out of characters. Buy more in plugin settings (Buy $1 / $5 / $15 packs).");
      return false;
    }
    this.logger.warn("chargeCharacters", "Credit spend status is unknown; blocking the AI call until the stable event is reconciled.");
    new import_obsidian5.Notice("Torbert: billing could not be verified. Retry after the connection is restored.");
    return false;
  }
  /** Preview and apply a transformation to the active editor or current selection. */
  async applyTransformationToEditor(editor, transformationId) {
    var _a;
    let processingNotice = null;
    try {
      const targetEditor = editor || ((_a = this.app.workspace.activeEditor) == null ? void 0 : _a.editor);
      if (!targetEditor) {
        new import_obsidian5.Notice("No active editor found.");
        return;
      }
      const transformation = transformations[transformationId];
      if (!transformation) {
        return;
      }
      const selection = targetEditor.getSelection();
      if (transformation.requiresSelection && !selection) {
        new import_obsidian5.Notice("This command requires a text selection.");
        return;
      }
      const textToTransform = selection || targetEditor.getValue();
      if (transformation.requiresAi && !await checkCharactersAvailable(this, textToTransform.length)) return;
      processingNotice = this.startProcessingNotice(`Processing ${transformation.name}`);
      const abortSignal = processingNotice.abortSignal;
      const { result: transformationResult, usage } = await collectAiUsageDuring(() => Promise.resolve(transformation.transform(textToTransform, { settings: this.settings, abortSignal })));
      const { newText, noticeText } = transformationResult;
      if (newText !== textToTransform && this.settings.reviewBeforeApply) {
        new BatchPreviewModal(
          this.app,
          `Review ${transformation.name}`,
          [{
            label: selection ? "Current selection" : "Current note",
            detail: summarizeTextChange(textToTransform, newText)
          }],
          () => {
            void (async () => {
              try {
                const currentText = selection ? targetEditor.getSelection() : targetEditor.getValue();
                if (currentText !== textToTransform) {
                  new import_obsidian5.Notice("The text changed while the preview was open. Review the change again.");
                  return;
                }
                if (transformation.requiresAi && !await this.chargeCharacters(textToTransform.length)) {
                  return;
                }
                await this.recordEditorSnapshot(`Editor: ${transformation.name}`, targetEditor);
                if (selection) {
                  targetEditor.replaceSelection(newText);
                } else {
                  targetEditor.setValue(newText);
                }
                new import_obsidian5.Notice(noticeText);
                this.showAiUsage(transformation.name, usage);
                this.logger.info("applyTransformationToEditor", `Applied '${transformationId}'. Notice: ${noticeText}`);
              } catch (error) {
                this.logger.error("applyTransformationToEditor", `Failed to apply '${transformationId}' after preview`, error);
                new import_obsidian5.Notice("Error applying the reviewed change. The original text was kept.");
              }
            })();
          }
        ).open();
        return;
      }
      if (newText !== textToTransform) {
        const currentText = selection ? targetEditor.getSelection() : targetEditor.getValue();
        if (currentText !== textToTransform) {
          new import_obsidian5.Notice("The text changed while processing. Run the transformation again.");
          return;
        }
        if (transformation.requiresAi && !await this.chargeCharacters(textToTransform.length)) return;
        await this.recordEditorSnapshot(`Editor: ${transformation.name}`, targetEditor);
      }
      if (selection) {
        targetEditor.replaceSelection(newText);
      } else {
        targetEditor.setValue(newText);
      }
      if (!processingNotice.wasCancelled()) {
        new import_obsidian5.Notice(noticeText);
        this.showAiUsage(transformation.name, usage);
      }
      this.logger.info("applyTransformationToEditor", `Applied '${transformationId}'. Notice: ${noticeText}`);
    } catch (error) {
      this.logger.error("applyTransformationToEditor", `Failed to apply '${transformationId}'`, error);
      new import_obsidian5.Notice((processingNotice == null ? void 0 : processingNotice.wasCancelled()) ? "Operation cancelled." : "Error applying transformation. Check developer console.");
    } finally {
      processingNotice == null ? void 0 : processingNotice.close();
    }
  }
  /** Preview and apply one transformation to a single Markdown file. */
  async applyTransformationToFile(file, transformationId) {
    let processingNotice = null;
    try {
      const transformation = transformations[transformationId];
      if (!transformation) {
        return;
      }
      const fileContents = await this.app.vault.read(file);
      processingNotice = this.startProcessingNotice(`Processing ${file.name}`);
      const abortSignal = processingNotice.abortSignal;
      const { result: transformationResult, usage } = await collectAiUsageDuring(() => Promise.resolve(transformation.transform(fileContents, { settings: this.settings, abortSignal })));
      const { newText, noticeText } = transformationResult;
      if (newText !== fileContents && this.settings.reviewBeforeApply) {
        new BatchPreviewModal(
          this.app,
          `Review ${transformation.name}`,
          [{ label: file.path, detail: summarizeTextChange(fileContents, newText) }],
          () => {
            void (async () => {
              try {
                const currentContents = await this.app.vault.read(file);
                if (currentContents !== fileContents) {
                  new import_obsidian5.Notice(`The note changed while the preview was open. Review ${file.name} again.`);
                  return;
                }
                if (transformation.requiresAi && !await this.chargeCharacters(fileContents.length)) {
                  return;
                }
                await this.recordOperation(`File: ${transformation.name}`, [{
                  path: file.path,
                  content: fileContents
                }]);
                await this.app.vault.modify(file, newText);
                new import_obsidian5.Notice(`${noticeText} in ${file.name}`);
                this.showAiUsage(`${transformation.name} on ${file.name}`, usage);
                this.logger.info("applyTransformationToFile", `Applied '${transformationId}' to ${file.path}.`);
              } catch (error) {
                this.logger.error("applyTransformationToFile", `Failed to apply '${transformationId}' after preview`, error);
                new import_obsidian5.Notice(`Error applying the reviewed change to ${file.name}. The original text was kept.`);
              }
            })();
          }
        ).open();
        return;
      }
      if (newText !== fileContents) {
        const currentContents = await this.app.vault.read(file);
        if (currentContents !== fileContents) {
          new import_obsidian5.Notice(`The note changed while processing. Run ${transformation.name} again.`);
          return;
        }
        if (transformation.requiresAi && !await this.chargeCharacters(fileContents.length)) return;
        await this.recordOperation(`File: ${transformation.name}`, [{ path: file.path, content: fileContents }]);
        await this.app.vault.modify(file, newText);
      }
      if (!processingNotice.wasCancelled()) {
        new import_obsidian5.Notice(`${noticeText} in ${file.name}`);
        this.showAiUsage(`${transformation.name} on ${file.name}`, usage);
      }
      this.logger.info("applyTransformationToFile", `Applied '${transformationId}' to ${file.path}.`);
    } catch (error) {
      this.logger.error("applyTransformationToFile", `Failed to apply '${transformationId}' to file ${file.path}`, error);
      new import_obsidian5.Notice((processingNotice == null ? void 0 : processingNotice.wasCancelled()) ? "Operation cancelled." : `Error processing file ${file.name}. Check developer console.`);
    } finally {
      processingNotice == null ? void 0 : processingNotice.close();
    }
  }
  /** Preview a folder batch, then process files with cancellation and progress. */
  async applyTransformationToFolder(folder, transformationId) {
    var _a, _b;
    let processingNotice = null;
    try {
      const files = this.getMarkdownFilesInFolder(folder);
      if (files.length === 0) {
        new import_obsidian5.Notice(`No Markdown files found in ${folder.name}.`);
        return;
      }
      processingNotice = this.startProcessingNotice(`Processing ${files.length} file(s) with ${((_a = transformations[transformationId]) == null ? void 0 : _a.name) || transformationId}`);
      const snapshots = [];
      const pendingWrites = [];
      let processedCount = 0;
      let failedCount = 0;
      for (const file of files) {
        try {
          processingNotice.throwIfCancelled();
          const transformation = transformations[transformationId];
          if (!transformation) {
            return;
          }
          const fileContents = await this.app.vault.read(file);
          if (transformation.requiresAi && !await this.chargeCharacters(fileContents.length)) {
            this.logger.info("applyTransformationToFolder", "Out of characters; stopped the batch.");
            break;
          }
          const abortSignal = processingNotice.abortSignal;
          const { result: transformationResult, usage } = await collectAiUsageDuring(() => Promise.resolve(transformation.transform(fileContents, { settings: this.settings, abortSignal })));
          const { newText } = transformationResult;
          this.showAiUsage(`${transformation.name} on ${file.name}`, usage);
          if (newText !== fileContents) {
            snapshots.push({
              path: file.path,
              content: fileContents
            });
            pendingWrites.push({ file, oldText: fileContents, newText });
          }
          processedCount++;
        } catch (error) {
          failedCount++;
          this.logger.error("applyTransformationToFolder", `Failed '${transformationId}' on ${file.path}`, error);
        }
      }
      if (pendingWrites.length > 0 && this.settings.reviewBeforeApply) {
        const previewItems = pendingWrites.map((item) => ({
          label: item.file.path,
          detail: summarizeTextChange(item.oldText, item.newText)
        }));
        new BatchPreviewModal(this.app, `Review ${((_b = transformations[transformationId]) == null ? void 0 : _b.name) || transformationId}`, previewItems, () => {
          void this.applyPendingFolderWrites(folder, transformationId, pendingWrites, snapshots, processedCount, failedCount);
        }).open();
        return;
      }
      if (pendingWrites.length > 0) await this.applyPendingFolderWrites(folder, transformationId, pendingWrites, snapshots, processedCount, failedCount);
      const failureText = failedCount > 0 ? ` ${failedCount} file(s) failed.` : "";
      new import_obsidian5.Notice(`Applied to ${processedCount} Markdown file(s) in ${folder.name}.${failureText}`);
      this.logger.info("applyTransformationToFolder", `Applied '${transformationId}' to ${processedCount} file(s) in ${folder.path}. Failed: ${failedCount}.`);
    } catch (error) {
      this.logger.error("applyTransformationToFolder", `Failed to apply '${transformationId}' to folder ${folder.path}`, error);
      new import_obsidian5.Notice((processingNotice == null ? void 0 : processingNotice.wasCancelled()) ? "Operation cancelled." : `Error processing folder ${folder.name}. Check developer console.`);
    } finally {
      processingNotice == null ? void 0 : processingNotice.close();
    }
  }
  async applyPendingFolderWrites(folder, transformationId, pendingWrites, snapshots, processedCount, failedCount) {
    var _a, _b, _c;
    const processingNotice = this.startProcessingNotice(`Applying ${pendingWrites.length} file update(s)`);
    const reportItems = [];
    try {
      if (snapshots.length > 0) {
        processingNotice.throwIfCancelled();
        await this.recordOperation(`Folder: ${((_a = transformations[transformationId]) == null ? void 0 : _a.name) || transformationId}`, snapshots);
      }
      for (const pendingWrite of pendingWrites) {
        try {
          processingNotice.throwIfCancelled();
          const currentContents = await this.app.vault.read(pendingWrite.file);
          if (currentContents !== pendingWrite.oldText) {
            failedCount++;
            reportItems.push({ path: pendingWrite.file.path, status: "failed", message: "changed since preview" });
            continue;
          }
          await this.app.vault.modify(pendingWrite.file, pendingWrite.newText);
          reportItems.push({ path: pendingWrite.file.path, status: "changed", message: ((_b = transformations[transformationId]) == null ? void 0 : _b.name) || transformationId });
        } catch (error) {
          failedCount++;
          reportItems.push({ path: pendingWrite.file.path, status: "failed", message: String(error) });
          this.logger.error("applyPendingFolderWrites", `Failed '${transformationId}' on ${pendingWrite.file.path}`, error);
        }
      }
      await this.createBatchReport(`Folder ${((_c = transformations[transformationId]) == null ? void 0 : _c.name) || transformationId}`, folder.path, reportItems);
      const failureText = failedCount > 0 ? ` ${failedCount} file(s) failed.` : "";
      new import_obsidian5.Notice(`Applied to ${processedCount} Markdown file(s) in ${folder.name}.${failureText}`);
    } catch (error) {
      this.logger.error("applyPendingFolderWrites", `Cancelled or failed applying '${transformationId}' in ${folder.path}`, error);
      new import_obsidian5.Notice(processingNotice.wasCancelled() ? "Operation cancelled." : `Error applying changes in ${folder.name}.`);
    } finally {
      processingNotice.close();
    }
  }
  getMarkdownFilesInFolder(folder) {
    if (folder.name === GENERATED_REPORT_FOLDER_NAME) {
      return [];
    }
    return folder.children.flatMap((child) => {
      if (child instanceof import_obsidian5.TFile) {
        return child.extension === "md" ? [child] : [];
      }
      if (child instanceof import_obsidian5.TFolder) {
        return this.getMarkdownFilesInFolder(child);
      }
      return [];
    });
  }
  async classifyFile(file) {
    var _a;
    await this.classifyFiles([file], ((_a = file.parent) == null ? void 0 : _a.path) || "");
  }
  async classifyFilesInFolder(folder) {
    const files = this.getMarkdownFilesInFolder(folder);
    if (files.length === 0) {
      new import_obsidian5.Notice(`No Markdown files found in ${folder.name}.`);
      return;
    }
    await this.classifyFiles(files, folder.path);
  }
  async classifyFiles(files, sourcePath) {
    const processingNotice = this.startProcessingNotice(`Processing AI classification for ${files.length} file(s)`);
    const folderChoices = parseFolderList(this.settings.folderClassificationFolders);
    const movePlan = [];
    const snapshots = [];
    const reservedPaths = /* @__PURE__ */ new Set();
    let failedCount = 0;
    try {
      for (const file of files) {
        try {
          processingNotice.throwIfCancelled();
          const fileContents = await this.app.vault.read(file);
          if (!await this.chargeCharacters(fileContents.length)) {
            this.logger.info("classifyFiles", "Out of characters; stopped the batch.");
            break;
          }
          const { result: rawFolderName, usage } = await collectAiUsageDuring(() => classifyFolderFromContent(this.settings, folderChoices, fileContents, processingNotice.abortSignal));
          const folderName = sanitizeFolderName(rawFolderName);
          this.showAiUsage(`AI Classify Folder on ${file.name}`, usage);
          const desiredPath = folderName ? `${folderName}/${file.name}` : file.name;
          if (desiredPath === file.path) {
            continue;
          }
          const newPath = await this.getAvailablePathInFolder(folderName, file.name, reservedPaths);
          if (newPath !== file.path) {
            reservedPaths.add(newPath);
            movePlan.push({ file, newPath });
            snapshots.push({ path: file.path, currentPath: newPath, content: fileContents });
          }
        } catch (error) {
          failedCount++;
          this.logger.error("classifyFiles", `Failed to classify ${file.path}`, error);
        }
      }
    } catch (error) {
      this.logger.error("classifyFiles", `Cancelled or failed classification for ${sourcePath}`, error);
      new import_obsidian5.Notice(processingNotice.wasCancelled() ? "Operation cancelled." : "Error classifying files.");
      return;
    } finally {
      processingNotice.close();
    }
    if (movePlan.length === 0) {
      new import_obsidian5.Notice(`No classified moves suggested.${failedCount > 0 ? ` ${failedCount} file(s) failed.` : ""}`);
      return;
    }
    if (!this.settings.reviewBeforeApply) {
      await this.applyMovePlan("AI Folder Classification", sourcePath, movePlan, snapshots, failedCount);
      return;
    }
    new BatchPreviewModal(this.app, "AI Classify Folder", movePlan.map((item) => ({
      label: item.file.path,
      detail: `Proposed path: ${item.newPath}`
    })), () => {
      void this.applyMovePlan("AI Folder Classification", sourcePath, movePlan, snapshots, failedCount);
    }).open();
  }
  async applyMovePlan(label, sourcePath, movePlan, snapshots, failedCount) {
    const processingNotice = this.startProcessingNotice(`Applying ${movePlan.length} move(s)`);
    const reportItems = [];
    let movedCount = 0;
    try {
      if (snapshots.length > 0) {
        await this.recordOperation(label, snapshots);
      }
      for (const item of movePlan) {
        try {
          processingNotice.throwIfCancelled();
          const oldPath = item.file.path;
          await this.ensureFolderPath(item.newPath.split("/").slice(0, -1).join("/"));
          await this.app.vault.rename(item.file, item.newPath);
          movedCount++;
          reportItems.push({ path: oldPath, newPath: item.newPath, status: "moved" });
        } catch (error) {
          failedCount++;
          reportItems.push({ path: item.file.path, newPath: item.newPath, status: "failed", message: String(error) });
          this.logger.error("applyMovePlan", `Failed to move ${item.file.path} to ${item.newPath}`, error);
        }
      }
      await this.createBatchReport(label, sourcePath, reportItems);
      new import_obsidian5.Notice(`Moved ${movedCount} file(s).${failedCount > 0 ? ` ${failedCount} file(s) failed.` : ""}`);
    } catch (error) {
      this.logger.error("applyMovePlan", `Cancelled or failed move plan for ${sourcePath}`, error);
      new import_obsidian5.Notice(processingNotice.wasCancelled() ? "Operation cancelled." : "Error applying move plan.");
    } finally {
      processingNotice.close();
    }
  }
  async createWeakTitlesReport(folder) {
    const processingNotice = this.startProcessingNotice(`Creating weak title report for ${folder.name}`);
    try {
      const items = [];
      for (const file of this.getMarkdownFilesInFolder(folder)) {
        processingNotice.throwIfCancelled();
        if (!isWeakTitle(file.basename)) {
          continue;
        }
        items.push(`- ${file.path}`);
      }
      const body = [
        "# Weak Titles",
        "",
        `Source folder: ${folder.path}`,
        `Created: ${(/* @__PURE__ */ new Date()).toISOString()}`,
        "",
        items.length > 0 ? items.join("\n") : "No weak titles found."
      ].filter(Boolean).join("\n");
      const reportPath = await this.createReportNote(folder.path, "weak-titles", body);
      new import_obsidian5.Notice(`Weak title report created: ${reportPath}`);
    } catch (error) {
      this.logger.error("createWeakTitlesReport", `Failed to create report for ${folder.path}`, error);
      new import_obsidian5.Notice(processingNotice.wasCancelled() ? "Operation cancelled." : `Error creating weak title report for ${folder.name}.`);
    } finally {
      processingNotice.close();
    }
  }
  async createDuplicateNotesReport(folder) {
    const processingNotice = this.startProcessingNotice(`Creating duplicate note report for ${folder.name}`);
    try {
      const files = this.getMarkdownFilesInFolder(folder);
      const readResults = await Promise.allSettled(files.map(async (file) => ({ file, content: await this.app.vault.read(file) })));
      const contents = readResults.filter((result) => result.status === "fulfilled").map((result) => result.value);
      const failedCount = readResults.length - contents.length;
      const items = [];
      for (let leftIndex = 0; leftIndex < contents.length; leftIndex++) {
        processingNotice.throwIfCancelled();
        for (let rightIndex = leftIndex + 1; rightIndex < contents.length; rightIndex++) {
          processingNotice.throwIfCancelled();
          const similarity = noteSimilarity(contents[leftIndex].content, contents[rightIndex].content);
          if (similarity >= 0.82) {
            items.push(`- ${Math.round(similarity * 100)}% similar: ${contents[leftIndex].file.path} <-> ${contents[rightIndex].file.path}. Suggested action: compare, merge unique content, then remove or archive one copy.`);
          }
        }
      }
      const body = [
        "# Duplicate Note Detection",
        "",
        `Source folder: ${folder.path}`,
        `Created: ${(/* @__PURE__ */ new Date()).toISOString()}`,
        "",
        items.length > 0 ? items.join("\n") : "No likely duplicate notes found.",
        failedCount > 0 ? `
Failed files: ${failedCount}` : ""
      ].filter(Boolean).join("\n");
      const reportPath = await this.createReportNote(folder.path, "duplicate-note-detection", body);
      new import_obsidian5.Notice(`Duplicate note report created: ${reportPath}`);
    } catch (error) {
      this.logger.error("createDuplicateNotesReport", `Failed to create report for ${folder.path}`, error);
      new import_obsidian5.Notice(processingNotice.wasCancelled() ? "Operation cancelled." : `Error creating duplicate note report for ${folder.name}.`);
    } finally {
      processingNotice.close();
    }
  }
  async applyCustomPromptToFile(file, preset) {
    const processingNotice = this.startProcessingNotice(`Processing prompt for ${file.name}`);
    try {
      const fileContents = await this.app.vault.read(file);
      if (!await this.chargeCharacters(fileContents.length)) {
        return;
      }
      const { result: newText, usage } = await collectAiUsageDuring(() => rewriteWithOpenAi(this.settings, preset.prompt, fileContents, processingNotice.abortSignal));
      if (newText !== fileContents && this.settings.reviewBeforeApply) {
        new BatchPreviewModal(
          this.app,
          `Review prompt: ${preset.name}`,
          [{ label: file.path, detail: summarizeTextChange(fileContents, newText) }],
          () => {
            void (async () => {
              try {
                const currentContents = await this.app.vault.read(file);
                if (currentContents !== fileContents) {
                  new import_obsidian5.Notice(`The note changed while the preview was open. Review ${file.name} again.`);
                  return;
                }
                await this.recordOperation(`Prompt: ${preset.name}`, [{ path: file.path, content: fileContents }]);
                await this.app.vault.modify(file, newText);
                new import_obsidian5.Notice(`Applied prompt preset to ${file.name}.`);
                this.showAiUsage(`Prompt ${preset.name} on ${file.name}`, usage);
              } catch (error) {
                this.logger.error("applyCustomPromptToFile", `Failed prompt '${preset.name}' after preview`, error);
                new import_obsidian5.Notice(`Error applying the reviewed change to ${file.name}. The original text was kept.`);
              }
            })();
          }
        ).open();
        return;
      }
      if (newText !== fileContents) {
        const currentContents = await this.app.vault.read(file);
        if (currentContents !== fileContents) {
          new import_obsidian5.Notice(`The note changed while processing. Run the prompt again.`);
          return;
        }
        await this.recordOperation(`Prompt: ${preset.name}`, [{ path: file.path, content: fileContents }]);
        await this.app.vault.modify(file, newText);
      }
      if (!processingNotice.wasCancelled()) {
        new import_obsidian5.Notice(`Applied prompt preset to ${file.name}.`);
        this.showAiUsage(`Prompt ${preset.name} on ${file.name}`, usage);
      }
    } catch (error) {
      this.logger.error("applyCustomPromptToFile", `Failed prompt '${preset.name}' on ${file.path}`, error);
      new import_obsidian5.Notice(processingNotice.wasCancelled() ? "Operation cancelled." : `Error applying prompt preset to ${file.name}.`);
    } finally {
      processingNotice.close();
    }
  }
  async applyCustomPromptToFolder(folder, preset) {
    let processingNotice = null;
    const files = this.getMarkdownFilesInFolder(folder);
    const pendingWrites = [];
    const snapshots = [];
    let failedCount = 0;
    try {
      processingNotice = this.startProcessingNotice(`Processing prompt for ${files.length} file(s)`);
      for (const file of files) {
        try {
          processingNotice.throwIfCancelled();
          const fileContents = await this.app.vault.read(file);
          if (!await this.chargeCharacters(fileContents.length)) {
            this.logger.info("applyCustomPromptToFolder", "Out of characters; stopped the batch.");
            break;
          }
          const abortSignal = processingNotice.abortSignal;
          const { result: newText, usage } = await collectAiUsageDuring(() => rewriteWithOpenAi(this.settings, preset.prompt, fileContents, abortSignal));
          this.showAiUsage(`Prompt ${preset.name} on ${file.name}`, usage);
          if (newText !== fileContents) {
            snapshots.push({ path: file.path, content: fileContents });
            pendingWrites.push({ file, oldText: fileContents, newText });
          }
        } catch (error) {
          failedCount++;
          this.logger.error("applyCustomPromptToFolder", `Failed prompt '${preset.name}' on ${file.path}`, error);
        }
      }
    } catch (error) {
      this.logger.error("applyCustomPromptToFolder", `Cancelled or failed prompt '${preset.name}' in ${folder.path}`, error);
      new import_obsidian5.Notice((processingNotice == null ? void 0 : processingNotice.wasCancelled()) ? "Operation cancelled." : `Error applying prompt preset in ${folder.name}.`);
      return;
    } finally {
      processingNotice == null ? void 0 : processingNotice.close();
    }
    if (pendingWrites.length === 0) {
      new import_obsidian5.Notice(`No prompt preset changes suggested.${failedCount > 0 ? ` ${failedCount} file(s) failed.` : ""}`);
      return;
    }
    if (!this.settings.reviewBeforeApply) {
      await this.applyCustomPromptFolderWrites(folder.path, preset, pendingWrites, snapshots, failedCount);
      return;
    }
    new BatchPreviewModal(this.app, `Review prompt: ${preset.name}`, pendingWrites.map((item) => ({
      label: item.file.path,
      detail: summarizeTextChange(item.oldText, item.newText)
    })), () => {
      void this.applyCustomPromptFolderWrites(folder.path, preset, pendingWrites, snapshots, failedCount);
    }).open();
  }
  async applyCustomPromptFolderWrites(sourcePath, preset, pendingWrites, snapshots, failedCount) {
    const processingNotice = this.startProcessingNotice(`Applying prompt changes to ${pendingWrites.length} file(s)`);
    const reportItems = [];
    try {
      await this.recordOperation(`Prompt: ${preset.name}`, snapshots);
      for (const pendingWrite of pendingWrites) {
        try {
          processingNotice.throwIfCancelled();
          const currentContents = await this.app.vault.read(pendingWrite.file);
          if (currentContents !== pendingWrite.oldText) {
            failedCount++;
            reportItems.push({ path: pendingWrite.file.path, status: "failed", message: "changed since preview" });
            continue;
          }
          await this.app.vault.modify(pendingWrite.file, pendingWrite.newText);
          reportItems.push({ path: pendingWrite.file.path, status: "changed", message: preset.name });
        } catch (error) {
          failedCount++;
          reportItems.push({ path: pendingWrite.file.path, status: "failed", message: String(error) });
        }
      }
      await this.createBatchReport(`Prompt ${preset.name}`, sourcePath, reportItems);
      new import_obsidian5.Notice(`Applied prompt preset to ${pendingWrites.length} file(s).${failedCount > 0 ? ` ${failedCount} file(s) failed.` : ""}`);
    } catch (error) {
      this.logger.error("applyCustomPromptFolderWrites", `Cancelled or failed applying prompt '${preset.name}' in ${sourcePath}`, error);
      new import_obsidian5.Notice(processingNotice.wasCancelled() ? "Operation cancelled." : `Error applying prompt changes.`);
    } finally {
      processingNotice.close();
    }
  }
  /** Restore the most recent saved operation snapshot after explicit confirmation. */
  async restoreLastOperation() {
    var _a;
    const lastOperation = this.settings.operationHistory[0];
    if (!lastOperation) {
      new import_obsidian5.Notice("No Torbert Text AI changes to restore.");
      return;
    }
    const processingNotice = this.startProcessingNotice(`Restoring ${lastOperation.label}`);
    let restoredCount = 0;
    let failedCount = 0;
    try {
      for (const snapshot of [...lastOperation.snapshots].reverse()) {
        try {
          processingNotice.throwIfCancelled();
          if (snapshot.editorOnly) {
            const editor = (_a = this.app.workspace.activeEditor) == null ? void 0 : _a.editor;
            if (!editor) {
              throw new Error("No active editor found for editor-only restore.");
            }
            editor.setValue(snapshot.content);
            restoredCount++;
            continue;
          }
          const currentPath = snapshot.currentPath || snapshot.path;
          const currentFile = this.app.vault.getAbstractFileByPath(currentPath);
          if (currentFile instanceof import_obsidian5.TFile) {
            await this.app.vault.modify(currentFile, snapshot.content);
            if (snapshot.currentPath && snapshot.currentPath !== snapshot.path) {
              await this.app.vault.rename(currentFile, snapshot.path);
            }
            restoredCount++;
            continue;
          }
          const originalFile = this.app.vault.getAbstractFileByPath(snapshot.path);
          if (originalFile instanceof import_obsidian5.TFile) {
            await this.app.vault.modify(originalFile, snapshot.content);
            restoredCount++;
            continue;
          }
          await this.app.vault.create(snapshot.path, snapshot.content);
          restoredCount++;
        } catch (error) {
          failedCount++;
          this.logger.error("restoreLastOperation", `Failed to restore ${snapshot.path}`, error);
        }
      }
    } finally {
      processingNotice.close();
    }
    if (failedCount === 0) {
      this.settings.operationHistory = this.settings.operationHistory.slice(1);
      await this.saveSettings();
      new import_obsidian5.Notice(`Restored ${restoredCount} item(s) from ${lastOperation.label}.`);
      return;
    }
    new import_obsidian5.Notice(`Restore incomplete: ${restoredCount} item(s) restored and ${failedCount} failed. The operation remains available to retry.`);
  }
  async recordEditorSnapshot(label, editor) {
    const activeFile = this.app.workspace.getActiveFile();
    if (activeFile) {
      await this.recordOperation(label, [{
        path: activeFile.path,
        content: editor.getValue()
      }]);
      return;
    }
    await this.recordOperation(label, [{
      path: "__active_editor__",
      content: editor.getValue(),
      editorOnly: true
    }]);
  }
  async recordOperation(label, snapshots) {
    if (snapshots.length === 0) {
      return;
    }
    const operation = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      label,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      snapshots
    };
    this.settings.operationHistory = [
      operation,
      ...this.settings.operationHistory || []
    ].slice(0, 20);
    await this.saveSettings();
  }
  async getAvailablePathInFolder(folderPath, fileName, reservedPaths = /* @__PURE__ */ new Set()) {
    const cleanFolderPath = sanitizeFolderName(folderPath);
    const extension = ".md";
    const baseName = fileName.replace(/\.md$/i, "");
    const prefix = cleanFolderPath ? `${cleanFolderPath}/` : "";
    let candidatePath = `${prefix}${baseName}${extension}`;
    let suffix = 2;
    while (reservedPaths.has(candidatePath) || await this.app.vault.adapter.exists(candidatePath)) {
      candidatePath = `${prefix}${baseName}-${suffix}${extension}`;
      suffix++;
    }
    return candidatePath;
  }
  async ensureFolderPath(folderPath) {
    if (!folderPath) {
      return;
    }
    const parts = folderPath.split("/").filter(Boolean);
    let currentPath = "";
    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      if (!await this.app.vault.adapter.exists(currentPath)) {
        await this.app.vault.createFolder(currentPath);
      }
    }
  }
  getCustomPromptPresets() {
    return (this.settings.customPromptPresets || []).map((preset) => ({
      name: preset.name.trim(),
      prompt: preset.prompt.trim()
    })).filter((preset) => preset.name && preset.prompt);
  }
  async createBatchReport(label, sourcePath, items) {
    const lines = [
      `# ${label} Report`,
      "",
      `Source: ${sourcePath || "/"}`,
      `Created: ${(/* @__PURE__ */ new Date()).toISOString()}`,
      "",
      "Restore: use the command `Restore last Torbert Text AI change` for the latest recorded operation.",
      "",
      "## Results",
      "",
      ...items.map((item) => {
        const target = item.newPath ? ` -> ${item.newPath}` : "";
        const message = item.message ? ` (${item.message})` : "";
        return `- ${item.status}: ${item.path}${target}${message}`;
      })
    ];
    return this.createReportNote(sourcePath, "torbert-batch-report", lines.join("\n"));
  }
  async createReportNote(sourcePath, slug, content) {
    const reportsFolder = sourcePath && sourcePath !== "/" ? `${sourcePath}/Torbert Reports` : "Torbert Reports";
    await this.ensureFolderPath(reportsFolder);
    const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
    let path = `${reportsFolder}/${stamp}-${slug}.md`;
    let suffix = 2;
    while (await this.app.vault.adapter.exists(path)) {
      path = `${reportsFolder}/${stamp}-${slug}-${suffix}.md`;
      suffix++;
    }
    await this.app.vault.create(path, `${content.trim()}
`);
    return path;
  }
  async loadSettings() {
    const loadedSettings = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedSettings);
    if (loadedSettings == null ? void 0 : loadedSettings.enabledTransformations) {
      this.settings.enabledTransformations = Object.assign(
        {},
        DEFAULT_SETTINGS.enabledTransformations,
        loadedSettings.enabledTransformations
      );
    }
    this.settings.operationHistory = this.settings.operationHistory || [];
    this.settings.customPromptPresets = this.settings.customPromptPresets || DEFAULT_SETTINGS.customPromptPresets;
    this.settings.folderClassificationFolders = this.settings.folderClassificationFolders || DEFAULT_SETTINGS.folderClassificationFolders;
    this.settings.largeContentOpenAiModel = this.settings.largeContentOpenAiModel || DEFAULT_SETTINGS.largeContentOpenAiModel;
    this.settings.openAiApiBase = this.settings.openAiApiBase || DEFAULT_SETTINGS.openAiApiBase;
    this.settings.constanceDeviceId = this.settings.constanceDeviceId || "";
    this.settings.billingEmail = this.settings.billingEmail || "";
    this.settings.billingAccessToken = typeof this.settings.billingAccessToken === "string" ? this.settings.billingAccessToken : "";
    this.settings.billingAccountLinked = this.settings.billingAccountLinked === true && Boolean(this.settings.billingAccessToken);
    this.settings.freeCharacters = 0;
    this.settings.purchasedCharacters = typeof this.settings.purchasedCharacters === "number" ? this.settings.purchasedCharacters : DEFAULT_SETTINGS.purchasedCharacters;
  }
  async saveSettings() {
    await this.saveData(this.settings);
    if (this.logger) {
      this.logger.setEnabled(this.settings.enableLogging);
    }
  }
};
