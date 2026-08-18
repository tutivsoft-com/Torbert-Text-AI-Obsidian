import { sanitizeFileNameStem } from "./ai";

export interface WeakTitleSuggestion {
  path: string;
  currentBaseName: string;
  suggestedBaseName: string;
  reason: string;
}

export interface SimilarNotePair {
  leftPath: string;
  rightPath: string;
  similarity: number;
}

export const parseFolderList = (value: string): string[] => [...new Set(value
  .split(/[\n,]+/)
  .map((folder) => folder.trim().replace(/^\/+|\/+$/g, ""))
  .filter(Boolean))];

export const isWeakTitle = (baseName: string): boolean => {
  const normalized = baseName.toLowerCase().trim();

  return [
    /^untitled(?:\s+\d+)?$/,
    /^new note(?:\s+\d+)?$/,
    /^note(?:\s+\d+)?$/,
    /^draft(?:\s+\d+)?$/,
    /^\d{4}-\d{2}-\d{2}(?:[\s_-]\d+)?$/,
    /^\d{8}(?:[\s_-]\d+)?$/,
    /^20\d{2}[\s_-]?\d{1,2}[\s_-]?\d{1,2}$/,
  ].some((pattern) => pattern.test(normalized));
};

export const suggestTitleFromContent = (content: string, fallback: string): string => {
  const heading = content.match(/^#\s+(.+)$/m)?.[1];
  const firstUsefulLine = content
    .replace(/^---\n[\s\S]*?\n---\n?/, "")
    .split("\n")
    .map((line) => line.replace(/^[-*+]\s+/, "").replace(/^#+\s+/, "").trim())
    .find((line) => line.length >= 8 && !/^[-*+]?\s*\[[ xX]\]/.test(line));
  const candidate = heading || firstUsefulLine || fallback;

  return sanitizeFileNameStem(candidate).split("-").slice(0, 10).join("-") || sanitizeFileNameStem(fallback) || "renamed-note";
};

export const normalizeNoteForSimilarity = (content: string): string => content
  .replace(/^---\n[\s\S]*?\n---\n?/, "")
  .replace(/```[\s\S]*?```/g, " ")
  .replace(/https?:\/\/\S+/gi, " ")
  .toLowerCase()
  .replace(/[^\p{L}\p{N}\s]/gu, " ")
  .replace(/\s+/g, " ")
  .trim();

export const noteSimilarity = (left: string, right: string): number => {
  const leftTokens = new Set(normalizeNoteForSimilarity(left).split(" ").filter((token) => token.length > 2));
  const rightTokens = new Set(normalizeNoteForSimilarity(right).split(" ").filter((token) => token.length > 2));

  if (leftTokens.size < 8 || rightTokens.size < 8) {
    return 0;
  }

  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const smallerSetSize = Math.min(leftTokens.size, rightTokens.size);

  return smallerSetSize === 0 ? 0 : intersection / smallerSetSize;
};

export const cleanupMarkdownStructure = (text: string): string => {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const cleaned: string[] = [];
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
      line = line
        .replace(/^(#{1,6})([^\s#])/g, "$1 $2")
        .replace(/^(\s*)[-*+]\s+\[done\]\s*/i, (_match, indent) => `${indent}- [x] `)
        .replace(/^(\s*)[-*+]\s+\[todo\]\s*/i, (_match, indent) => `${indent}- [ ] `)
        .replace(/^(\s*)[-*+]\s+\[x\]\s*/i, (_match, indent) => `${indent}- [x] `)
        .replace(/^(\s*)[-*+]\s+\[\s*\]\s*/g, (_match, indent) => `${indent}- [ ] `)
        .replace(/^(\s*)[-*+]\s+/g, (_match, indent) => `${indent.replace(/\t/g, "  ")}- `);

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

  return cleaned
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
};

export const extractActionItems = (text: string): string[] => {
  const actionPatterns = [
    /\b(todo|to-do|follow up|follow-up|action|next step|deadline|due|call|email|send|schedule|review|fix|ship|pay|renew)\b/i,
    /@\w+/,
    /\b\d{4}-\d{2}-\d{2}\b/,
    /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}\b/i,
  ];

  return [...new Set(text
    .replace(/^## Action Items\s*\n+[\s\S]*?(?=\n#{1,6}\s|\s*$)/im, "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && actionPatterns.some((pattern) => pattern.test(line)))
    .map((line) => line.replace(/^[-*+]\s+/, "").replace(/^\[[ xX]\]\s+/, "").trim())
    .map((line) => `- [ ] ${line}`))];
};

export const applyActionItemsSection = (text: string): { newText: string; count: number } => {
  const actionItems = extractActionItems(text);
  const section = actionItems.length > 0
    ? `## Action Items\n\n${actionItems.join("\n")}`
    : "## Action Items\n\n- [ ] Review this note for next steps.";

  if (/^## Action Items\s*$/im.test(text)) {
    return {
      newText: text.replace(/^## Action Items\s*\n+[\s\S]*?(?=\n#{1,6}\s|\s*$)/im, `${section}\n\n`),
      count: actionItems.length,
    };
  }

  return {
    newText: `${text.replace(/\s+$/g, "")}\n\n${section}\n`,
    count: actionItems.length,
  };
};
