import { applyFrontMatter, applySummary, applyTagsFrontMatter, generateDelimitedSummaryPrefix, generateFrontMatterFromContent, generateSummaryFromContent, generateTagsFromContent, highlightReadingKeywordsWithOpenAi, rewriteWithOpenAi } from "./ai";
import { applyActionItemsSection, cleanupMarkdownStructure } from "./feature-utils";
import type { Transformation } from "./types";

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const parseKeywords = (keywords: string): string[] => [...new Set(keywords
  .split(/[\n,]+/)
  .map((keyword) => keyword.trim())
  .filter(Boolean))]
  .sort((a, b) => b.length - a.length);

const highlightKeywordsInText = (text: string, keywords: string): { newText: string; count: number } => {
  const parsedKeywords = parseKeywords(keywords);
  let count = 0;

  if (parsedKeywords.length === 0) {
    return { newText: text, count };
  }

  const keywordPattern = new RegExp(`(${parsedKeywords.map(escapeRegExp).join("|")})`, "gi");
  const newText = text.split("\n").map((line) => line
    .split(/(==.*?==)/g)
    .map((part) => {
      if (part.startsWith("==") && part.endsWith("==")) {
        return part;
      }

      return part.replace(keywordPattern, (match) => {
        count++;
        return `==${match}==`;
      });
    })
    .join(""))
    .join("\n");

  return { newText, count };
};

const countWords = (text: string): number => {
  const matches = text.replace(/==/g, "").match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu);
  return matches ? matches.length : 0;
};

const READING_HIGHLIGHT_STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "because", "been", "but", "by", "for", "from", "had", "has", "have", "he", "her", "him", "his", "i", "if", "in", "is", "it", "its", "itself", "me", "my", "not", "of", "on", "or", "our", "she", "so", "that", "the", "their", "them", "then", "there", "they", "this", "to", "was", "we", "were", "what", "when", "where", "which", "who", "will", "with", "you", "your",
]);

const readingHighlightContent = (line: string): string => line
  .trim()
  .replace(/^(?:[-*+]|\d+[.)])\s+/, "")
  .replace(/^\d{12,14}\s*(?:[-:]\s*)?/, "")
  .trim();

const shouldSkipReadingHighlightLine = (line: string, inCodeBlock: boolean): boolean => {
  const trimmed = line.trim();
  const content = readingHighlightContent(trimmed);
  const wordCount = countWords(content);

  return inCodeBlock
    || !trimmed
    || trimmed.startsWith("```")
    || trimmed.includes("==")
    || /^#{1,6}\s+/.test(trimmed)
    || trimmed.includes("|")
    || /^[-*_]{3,}$/.test(trimmed)
    || /^\[\d+\]:\s+/.test(trimmed)
    || /^>\s*\*\*[QA]:\*\*/.test(trimmed)
    || wordCount < 4
    || (wordCount <= 5 && !/^(?:[-*+]|\d+[.)])\s+/.test(trimmed) && !/\d{12,14}/.test(trimmed) && !/[.!?。！？]$/.test(trimmed));
};

const stripHighlights = (text: string): string => text.replace(/==([^=\n]+)==/g, "$1");

const capReadingHighlights = (line: string, maxHighlights: number): string => {
  let seen = 0;

  return line.replace(/==([^=\n]+)==/g, (_match, content: string) => {
    seen++;
    return seen <= maxHighlights ? `==${content}==` : content;
  });
};

const fallbackReadingHighlights = (line: string, maxHighlights: number): string => {
  const content = readingHighlightContent(line);
  const candidates = [...content.matchAll(/[\p{L}][\p{L}\p{N}'-]*/gu)]
    .map((match) => match[0])
    .filter((word) => word.length >= 3 && !READING_HIGHLIGHT_STOPWORDS.has(word.toLowerCase()));
  const selected = [...new Set(candidates)].slice(0, maxHighlights);

  if (selected.length === 0) {
    return line;
  }

  let highlighted = line;
  selected
    .sort((a, b) => b.length - a.length)
    .forEach((word) => {
      highlighted = highlighted.replace(new RegExp(`(^|[^\\p{L}\\p{N}=])(${escapeRegExp(word)})(?=$|[^\\p{L}\\p{N}=])`, "u"), "$1==$2==");
    });

  return highlighted;
};

const sanitizeAiReadingHighlights = (originalText: string, aiText: string): { newText: string; changedCount: number } => {
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

    if (aiLine === undefined || shouldSkipReadingHighlightLine(originalLine, wasInCodeBlock) || stripHighlights(aiLine) !== originalLine) {
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
    changedCount,
  };
};

const normalizeForSimilarity = (line: string): string => line
  .toLowerCase()
  .replace(/==/g, "")
  .replace(/[^\p{L}\p{N}\s]/gu, " ")
  .replace(/\s+/g, " ")
  .trim();

const jaccardSimilarity = (left: string, right: string): number => {
  const leftTokens = new Set(normalizeForSimilarity(left).split(" ").filter(Boolean));
  const rightTokens = new Set(normalizeForSimilarity(right).split(" ").filter(Boolean));

  if (leftTokens.size === 0 && rightTokens.size === 0) {
    return 1;
  }

  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;

  return union === 0 ? 0 : intersection / union;
};

const removeSimilarDuplicateLines = (text: string, threshold = 0.9): { newText: string; removedCount: number } => {
  const keptLines: string[] = [];
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

const fixMarkdownNumbering = (text: string): string => {
  const counters = new Map<number, number>();

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

    [...counters.keys()]
      .filter((level) => level > indentLevel)
      .forEach((level) => counters.delete(level));
    counters.set(indentLevel, nextNumber);

    return `${indent}${nextNumber}. ${content}`;
  }).join("\n");
};

const DELIMITED_SUMMARY_SEPARATOR = ":-:";

const hasDelimitedSummaryPrefix = (text: string): boolean => {
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const separatorIndex = firstLine.indexOf(DELIMITED_SUMMARY_SEPARATOR);

  return separatorIndex > 0 && firstLine.slice(0, separatorIndex).trim().length > 0 && firstLine.slice(separatorIndex + DELIMITED_SUMMARY_SEPARATOR.length).trim().length > 0;
};

const addDelimitedSummaryPrefix = (text: string, summary: string): string => {
  const cleanSummary = summary.trim().replace(/\s+/g, " ").replace(/:-:/g, "").trim();

  if (!cleanSummary || hasDelimitedSummaryPrefix(text)) {
    return text;
  }

  return `${cleanSummary} ${DELIMITED_SUMMARY_SEPARATOR} ${text.replace(/^\s+/, "")}`;
};

const removeDelimitedSummaryPrefix = (text: string): { newText: string; removedCount: number } => {
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

/*
 * Keep these transformations pure: text in, text plus notice out.
 * That makes them safe to test against the old generated bundle and easy to
 * document with real examples in docs/TRANSFORMATIONS.md.
 */
export const transformations: Record<string, Transformation> = {
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
        noticeText: count > 0 ? `Replaced ${count} instance(s).` : "No bold text found.",
      };
    },
  },
  highlightKeywords: {
    name: "Highlight Keywords",
    category: "Text Cleanup",
    transform: (text, context) => {
      const { newText, count } = highlightKeywordsInText(text, context.settings.highlightKeywords);

      return {
        newText,
        noticeText: count > 0 ? `Highlighted ${count} keyword occurrence(s).` : "No keywords highlighted.",
      };
    },
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
        noticeText: count > 0 ? `Removed ${count} highlight(s).` : "No highlights found.",
      };
    },
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
        noticeText: changedCount > 0 ? `AI highlighted keywords in ${changedCount} line(s).` : "No safe lines found for AI keyword highlighting.",
      };
    },
  },
  toTitleCase: {
    name: "Title Case",
    category: "Text Cleanup",
    transform: (text) => ({
      newText: text.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.substr(1).toLowerCase()),
      noticeText: "Converted to Title Case.",
    }),
  },
  toUpperCase: {
    name: "UPPERCASE",
    category: "Text Cleanup",
    transform: (text) => ({
      newText: text.toUpperCase(),
      noticeText: "Converted to UPPERCASE.",
    }),
  },
  toLowerCase: {
    name: "lowercase",
    category: "Text Cleanup",
    transform: (text) => ({
      newText: text.toLowerCase(),
      noticeText: "Converted to lowercase.",
    }),
  },
  toSentenceCase: {
    name: "Sentence Case",
    category: "Text Cleanup",
    transform: (text) => ({
      newText: text.toLowerCase().replace(/(^\s*\w|[.!?]\s*\w)/g, (letter) => letter.toUpperCase()),
      noticeText: "Converted to Sentence case.",
    }),
  },
  sortLinesAsc: {
    name: "Sort Lines A-Z",
    category: "Text Cleanup",
    transform: (text) => ({
      newText: text.split("\n").sort((a, b) => a.localeCompare(b)).join("\n"),
      noticeText: "Lines sorted alphabetically.",
    }),
  },
  sortLinesDesc: {
    name: "Sort Lines Z-A",
    category: "Text Cleanup",
    transform: (text) => ({
      newText: text.split("\n").sort((a, b) => b.localeCompare(a)).join("\n"),
      noticeText: "Lines sorted reverse-alphabetically.",
    }),
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
        noticeText: `Toggled ${count} checkbox(es).`,
      };
    },
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
        noticeText: `Removed ${removedCount} duplicate line(s).`,
      };
    },
  },
  removeBlankLines: {
    name: "Remove Blank Lines",
    category: "Text Cleanup",
    transform: (text) => ({
      newText: text.replace(/^\s*[\r\n]/gm, ""),
      noticeText: "Removed blank lines.",
    }),
  },
  cleanExtraNewLines: {
    name: "Clean Extra Newlines",
    category: "Text Cleanup",
    transform: (text) => ({
      newText: text
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/^\n+|\n+$/g, ""),
      noticeText: "Cleaned extra new lines.",
    }),
  },
  joinLines: {
    name: "Join Lines",
    category: "Markdown Notes",
    requiresSelection: true,
    transform: (text) => ({
      newText: text.replace(/\n/g, " "),
      noticeText: "Lines joined.",
    }),
  },
  trimWhitespace: {
    name: "Trim Whitespace",
    category: "Text Cleanup",
    transform: (text) => ({
      newText: text.split("\n").map((line) => line.trim()).join("\n"),
      noticeText: "Whitespace trimmed.",
    }),
  },
  increaseHeading: {
    name: "Increase Heading Level",
    category: "Markdown Notes",
    transform: (text) => ({
      newText: text.replace(/^(#+)/gm, "#$1"),
      noticeText: "Increased heading level.",
    }),
  },
  decreaseHeading: {
    name: "Decrease Heading Level",
    category: "Markdown Notes",
    transform: (text) => ({
      newText: text.replace(/^(##+)/gm, (heading) => heading.slice(1)),
      noticeText: "Decreased heading level.",
    }),
  },
  linesToBullets: {
    name: "Lines to Bullets",
    category: "Markdown Notes",
    transform: (text) => ({
      newText: text.split("\n").map((line) => line.trim() ? `- ${line}` : line).join("\n"),
      noticeText: "Converted to bullet list.",
    }),
  },
  listToNumbered: {
    name: "Bullets to Numbers",
    category: "Markdown Notes",
    transform: (text) => {
      let itemNumber = 1;

      return {
        newText: text.replace(/^(\s*)[-*+]\s/gm, (_match, indent) => `${indent}${itemNumber++}. `),
        noticeText: "Converted to numbered list.",
      };
    },
  },
  fixMarkdownNumbering: {
    name: "Fix Numbering",
    category: "Markdown Notes",
    transform: (text) => ({
      newText: fixMarkdownNumbering(text),
      noticeText: "Fixed Markdown numbering.",
    }),
  },
  removeSimilarDuplicateLines: {
    name: "Remove Similar Lines",
    category: "Text Cleanup",
    transform: (text) => {
      const { newText, removedCount } = removeSimilarDuplicateLines(text);

      return {
        newText,
        noticeText: `Removed ${removedCount} similar duplicate line(s).`,
      };
    },
  },
  markdownStructureCleanup: {
    name: "Clean Markdown Structure",
    category: "Markdown Notes",
    transform: (text) => ({
      newText: cleanupMarkdownStructure(text),
      noticeText: "Cleaned Markdown structure.",
    }),
  },
  extractActionItems: {
    name: "Extract Actions",
    category: "Markdown Notes",
    transform: (text) => {
      const { newText, count } = applyActionItemsSection(text);

      return {
        newText,
        noticeText: count > 0 ? `Extracted ${count} action item(s).` : "Added an Action Items section.",
      };
    },
  },
  extractUrls: {
    name: "Extract URLs",
    category: "Markdown Notes",
    transform: (text) => {
      const urls = text.match(/https?:\/\/[^\s/$.?#].[^\s]*/gi) || [];

      return {
        newText: urls.join("\n"),
        noticeText: `Extracted ${urls.length} URL(s).`,
      };
    },
  },
  aiAddDelimitedSummaryPrefix: {
    name: "AI Summary Prefix",
    category: "AI",
    requiresAi: true,
    transform: async (text, context) => {
      if (hasDelimitedSummaryPrefix(text)) {
        return {
          newText: text,
          noticeText: "Delimited summary prefix already present.",
        };
      }

      const summary = await generateDelimitedSummaryPrefix(context.settings, text, context.abortSignal);

      return {
        newText: addDelimitedSummaryPrefix(text, summary),
        noticeText: summary ? "AI added delimited summary prefix." : "AI did not return a summary prefix.",
      };
    },
  },
  removeDelimitedSummaryPrefix: {
    name: "Remove AI Summary Prefix",
    category: "AI",
    transform: (text) => {
      const result = removeDelimitedSummaryPrefix(text);

      return {
        newText: result.newText,
        noticeText: result.removedCount > 0 ? `Removed ${result.removedCount} delimited summary prefix(es).` : "No delimited summary prefix found.",
      };
    },
  },
  slugify: {
    name: "Slugify",
    category: "Text Cleanup",
    transform: (text) => ({
      newText: text.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, ""),
      noticeText: "Slugified text.",
    }),
  },
  toStraightQuotes: {
    name: "Straight Quotes",
    category: "Text Cleanup",
    transform: (text) => ({
      newText: text.replace(/[“”]/g, "\"").replace(/[‘’]/g, "'"),
      noticeText: "Converted to straight quotes.",
    }),
  },
  urlEncode: {
    name: "URL Encode",
    category: "Text Cleanup",
    requiresSelection: true,
    transform: (text) => ({
      newText: encodeURIComponent(text),
      noticeText: "URL Encoded.",
    }),
  },
  urlDecode: {
    name: "URL Decode",
    category: "Text Cleanup",
    requiresSelection: true,
    transform: (text) => {
      try {
        return {
          newText: decodeURIComponent(text),
          noticeText: "URL Decoded.",
        };
      } catch {
        return {
          newText: text,
          noticeText: "Error: Invalid URI sequence.",
        };
      }
    },
  },
  aiAutoCorrectClarity: {
    name: "AI Correct & Clarify",
    category: "AI",
    requiresAi: true,
    usesFullText: true,
    transform: async (text, context) => ({
      newText: await rewriteWithOpenAi(
        context.settings,
        "Correct spelling, punctuation, grammar, casing, and small clarity issues. Do not change the real meaning. Make only minor edits needed to make the text clear.",
        text,
        context.abortSignal,
      ),
      noticeText: "AI corrected and clarified text.",
    }),
  },
  aiCorrectSpellingCasingGrammar: {
    name: "AI Grammar Fix",
    category: "AI",
    requiresAi: true,
    usesFullText: true,
    transform: async (text, context) => ({
      newText: await rewriteWithOpenAi(
        context.settings,
        "Correct only spelling, casing, and grammar. Do not rewrite style, do not add or remove ideas, and do not change punctuation unless required for grammar.",
        text,
        context.abortSignal,
      ),
      noticeText: "AI corrected spelling, casing, and grammar.",
    }),
  },
  aiCreateFrontMatter: {
    name: "AI Frontmatter",
    category: "AI",
    requiresAi: true,
    transform: async (text, context) => ({
      newText: applyFrontMatter(text, await generateFrontMatterFromContent(context.settings, "current-note", text, context.abortSignal)),
      noticeText: "AI created or updated frontmatter.",
    }),
  },
  aiNoteSummary: {
    name: "AI Note Summary",
    category: "AI",
    requiresAi: true,
    transform: async (text, context) => ({
      newText: applySummary(text, await generateSummaryFromContent(context.settings, text, context.abortSignal)),
      noticeText: "AI created or updated note summary.",
    }),
  },
  aiTagsOnly: {
    name: "AI Tags Only",
    category: "AI",
    requiresAi: true,
    transform: async (text, context) => ({
      newText: applyTagsFrontMatter(text, await generateTagsFromContent(context.settings, text, context.abortSignal)),
      noticeText: "AI created or updated tags only.",
    }),
  },
};
