# Torbert implemented transformations

Current version: **5.8.60**.

The table is derived from the current transformations object in src/transformations.ts. The source registers these transformations in menus/commands; menu visibility is configurable. Additional classification, reports and custom-prompt commands live in src/main.ts.

| ID | Name | Category | Processing |
|---|---|---|---|
| `boldToHighlight` | Bold to Highlight | Text Cleanup | Local |
| `highlightKeywords` | Highlight Keywords | Text Cleanup | Local |
| `removeHighlights` | Remove All Highlights | Text Cleanup | Local |
| `aiReadingKeywordHighlights` | AI Reading Highlights | AI | OpenRouter AI |
| `toTitleCase` | Title Case | Text Cleanup | Local |
| `toUpperCase` | UPPERCASE | Text Cleanup | Local |
| `toLowerCase` | lowercase | Text Cleanup | Local |
| `toSentenceCase` | Sentence Case | Text Cleanup | Local |
| `sortLinesAsc` | Sort Lines A-Z | Text Cleanup | Local |
| `sortLinesDesc` | Sort Lines Z-A | Text Cleanup | Local |
| `toggleCheckboxes` | Toggle Checkboxes | Markdown Notes | Local |
| `removeDuplicateLines` | Remove Duplicate Lines | Text Cleanup | Local |
| `removeBlankLines` | Remove Blank Lines | Text Cleanup | Local |
| `cleanExtraNewLines` | Clean Extra Newlines | Text Cleanup | Local |
| `joinLines` | Join Lines | Markdown Notes | Local |
| `trimWhitespace` | Trim Whitespace | Text Cleanup | Local |
| `increaseHeading` | Increase Heading Level | Markdown Notes | Local |
| `decreaseHeading` | Decrease Heading Level | Markdown Notes | Local |
| `linesToBullets` | Lines to Bullets | Markdown Notes | Local |
| `listToNumbered` | Bullets to Numbers | Markdown Notes | Local |
| `fixMarkdownNumbering` | Fix Numbering | Markdown Notes | Local |
| `removeSimilarDuplicateLines` | Remove Similar Lines | Text Cleanup | Local |
| `markdownStructureCleanup` | Clean Markdown Structure | Markdown Notes | Local |
| `extractActionItems` | Extract Actions | Markdown Notes | Local |
| `extractUrls` | Extract URLs | Markdown Notes | Local |
| `aiAddDelimitedSummaryPrefix` | AI Summary Prefix | AI | OpenRouter AI |
| `removeDelimitedSummaryPrefix` | Remove AI Summary Prefix | AI | Local |
| `slugify` | Slugify | Text Cleanup | Local |
| `toStraightQuotes` | Straight Quotes | Text Cleanup | Local |
| `urlEncode` | URL Encode | Text Cleanup | Local |
| `urlDecode` | URL Decode | Text Cleanup | Local |
| `aiNoteSummary` | AI Note Summary | AI | OpenRouter AI |

Local transformations run on selected or file text. AI transformations send the chosen text to OpenRouter. Review before applying is optional and off by default. Folder classification, weak-title/duplicate-note reports, custom prompts and Restore last change have separate command/menu entry points.

AI-required transformations use the fixed model and existing key resolver. Local transformation entries do not call the AI provider. Use plugin settings to configure the key and billing account.
