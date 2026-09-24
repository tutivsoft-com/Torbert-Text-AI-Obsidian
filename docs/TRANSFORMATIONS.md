# Transformations Reference

This document describes what each text command does, why it exists, and a sample input/output pair. The examples use the same behavior as `src/transformations.ts`.

## General Rules

- If text is selected, editor commands transform only the selection.
- If no text is selected, editor commands transform the whole active note.
- Commands marked "editor selection required" need a selection only when run from the editor.
- File-menu commands transform the whole Markdown file.
- Folder-menu commands transform all Markdown files in the selected folder and its subfolders.
- Every transformation is available from the command palette under a `Torbert Text AI: Category / Name` label, as well as the relevant editor, file, or folder menu.
- AI commands use the configured provider. A manually entered OpenRouter API key takes precedence; when blank, the repository's dedicated encrypted key manifest is loaded automatically.
- The plugin records the last 20 operations so recent text edits, file edits, recursive folder batches, summary updates and folder classification can be restored.

## Commands

### Bold to Highlight

Why: Convert Markdown bold syntax into Obsidian highlight syntax.

Input:

```md
This is **important** and **urgent**.
```

Output:

```md
This is ==important== and ==urgent==.
```

Notice: `Replaced 2 instance(s).`

### Highlight Keywords

Why: Wrap configured keywords with Obsidian highlight syntax while leaving the rest of each line unchanged.

Keywords setting:

```text
important, urgent
```

Input:

```md
This is important and urgent.
```

Output:

```md
This is ==important== and ==urgent==.
```

Notice: `Highlighted 2 keyword occurrence(s).`

### AI Reading Keyword Highlights

Why: Add just enough highlights to skim notes by reading the highlighted words.

Rules:

- Maximum 5 highlighted keywords or short phrases per line.
- Lines under 20 words are capped at 3 highlights.
- Headings, tables, code blocks, short fragments, link-reference lines, and already-highlighted lines are left unchanged.
- The command only accepts AI output that matches the original text after removing `==`, so content rewrites are discarded.

Input:

```md
This discounted chicken combo did create issues for me.
| Food | Price |
Short title words
```

Output:

```md
This ==discounted== ==chicken== ==combo== did create issues for me.
| Food | Price |
Short title words
```

Notice: `AI highlighted keywords in 1 line(s).`

### Remove All Highlights

Why: Remove Obsidian highlight syntax without changing the highlighted text.

Input:

```md
This is ==important==.
```

Output:

```md
This is important.
```

Notice: `Removed 1 highlight(s).`

### To Title Case

Why: Quickly normalize headings or short titles pasted in inconsistent casing.

Input:

```text
hello WORLD from rahul
```

Output:

```text
Hello World From Rahul
```

Notice: `Converted to Title Case.`

### To UPPERCASE

Why: Make selected text visually loud, useful for labels or temporary markers.

Input:

```text
Hello world 123
```

Output:

```text
HELLO WORLD 123
```

Notice: `Converted to UPPERCASE.`

### To lowercase

Why: Normalize pasted text that arrived in all caps or mixed casing.

Input:

```text
Hello WORLD 123
```

Output:

```text
hello world 123
```

Notice: `Converted to lowercase.`

### To Sentence case

Why: Convert rough text into sentence-style capitalization.

Input:

```text
hELLO world. this IS next! and this? yes
```

Output:

```text
Hello world. This is next! And this? Yes
```

Notice: `Converted to Sentence case.`

### Sort lines (A-Z)

Why: Alphabetize lists, notes, or copied rows.

Input:

```text
banana
Apple
cherry
apple
```

Output:

```text
apple
Apple
banana
cherry
```

Notice: `Lines sorted alphabetically.`

### Sort lines (Z-A)

Why: Reverse-sort lists, notes, or copied rows.

Input:

```text
banana
Apple
cherry
apple
```

Output:

```text
cherry
banana
Apple
apple
```

Notice: `Lines sorted reverse-alphabetically.`

### Toggle Checkboxes

Why: Flip simple Markdown task states without editing each checkbox manually.

Input:

```md
- [ ] todo
- [x] done
- [X] ignored
```

Output:

```md
- [x] todo
- [ ] done
- [X] ignored
```

Notice: `Toggled 2 checkbox(es).`

### Remove Duplicate Lines

Why: Clean copied lists while preserving the first appearance of each line.

Input:

```text
a
b
a

b
```

Output:

```text
a
b

```

Notice: `Removed 2 duplicate line(s).`

### Remove Blank Lines

Why: Compact loose pasted text by removing empty or whitespace-only lines.

Input:

```text
a

  
 b

```

Output:

```text
a
 b
```

Notice: `Removed blank lines.`

### Clean Extra New Lines

Why: Compact accidental runs of blank lines while preserving paragraph breaks.

Input:

```text
First paragraph.



Second paragraph.
```

Output:

```text
First paragraph.

Second paragraph.
```

Notice: `Cleaned extra new lines.`

### Join Lines

Editor selection required.

Why: Turn a selected multi-line fragment into one line without changing the whole note.

Input:

```text
one
two
three
```

Output:

```text
one two three
```

Notice: `Lines joined.`

### Trim Whitespace

Why: Remove leading and trailing whitespace from each line while keeping line breaks.

Input:

```text
  one  
	two	
three
```

Output:

```text
one
two
three
```

Notice: `Whitespace trimmed.`

### Increase Heading Level

Why: Demote Markdown headings one level.

Input:

```md
# H1
text
### H3
```

Output:

```md
## H1
text
#### H3
```

Notice: `Increased heading level.`

### Decrease Heading Level

Why: Promote Markdown headings one level, while leaving single `#` headings unchanged.

Input:

```md
# H1
## H2
### H3
```

Output:

```md
# H1
# H2
## H3
```

Notice: `Decreased heading level.`

### Lines to Bullet List

Why: Turn plain lines into a Markdown bullet list.

Input:

```text
one

 two
```

Output:

```md
- one

-  two
```

Notice: `Converted to bullet list.`

### Bullets to Numbered List

Why: Convert a Markdown bullet list into a numbered list.

Input:

```md
- one
  * two
+ three
plain
```

Output:

```md
1. one
  2. two
3. three
plain
```

Notice: `Converted to numbered list.`

### Fix Markdown Numbering

Why: Renumber Markdown ordered lists with `1.`, `2.`, `3.` syntax and restart after headings or paragraph breaks.

Input:

```md
# Section
4. First
9. Second
```

Output:

```md
# Section
1. First
2. Second
```

Notice: `Fixed Markdown numbering.`

### Remove Similar Duplicate Lines

Why: Remove later lines that are at least 90% similar to earlier lines after case, punctuation, and spacing normalization.

Input:

```text
Call Rahul today.
call rahul today!
Keep this line.
```

Output:

```text
Call Rahul today.
Keep this line.
```

Notice: `Removed 1 similar duplicate line(s).`

### Extract URLs

Why: Pull links out of pasted text into a clean list.

Input:

```text
Visit https://example.com/a?b=1 and http://test.dev/path. ok
```

Output:

```text
https://example.com/a?b=1
http://test.dev/path.
```

Notice: `Extracted 2 URL(s).`

### AI Add Delimited Summary Prefix

Why: Add a searchable one-line AI prefix to the beginning of a note, separated from the original content with `:-:`.

Input:

```text
20260105200101 Sri Udupi Park 1, Katha 157/8, Pattandur
```

Output:

```text
Sri Udupi Park Katha Pattandur Bangalore :-: 20260105200101 Sri Udupi Park 1, Katha 157/8, Pattandur
```

Notice: `AI added delimited summary prefix.`

### Remove Delimited Summary Prefix

Why: Remove a generated prefix from the first line and keep the original note content after `:-:`.

Input:

```text
Sri Udupi Park Katha Pattandur Bangalore :-: 20260105200101 Sri Udupi Park 1, Katha 157/8, Pattandur
```

Output:

```text
20260105200101 Sri Udupi Park 1, Katha 157/8, Pattandur
```

Notice: `Removed delimited summary prefix.`

### Slugify

Why: Convert titles into URL/file-name friendly slugs.

Input:

```text
 Hello, World! This_is a test 
```

Output:

```text
hello-world-this-is-a-test
```

Notice: `Slugified text.`

### Smart to Straight Quotes

Why: Normalize curly quotes from rich text sources into plain text quotes.

Input:

```text
“Hello” ‘Rahul’
```

Output:

```text
"Hello" 'Rahul'
```

Notice: `Converted to straight quotes.`

### URL Encode

Editor selection required.

Why: Encode selected text for use inside URLs or query strings.

Input:

```text
hello world/?x=1&y=two
```

Output:

```text
hello%20world%2F%3Fx%3D1%26y%3Dtwo
```

Notice: `URL Encoded.`

### URL Decode

Editor selection required.

Why: Decode URL-encoded text back into readable text.

Input:

```text
hello%20world%2F%3Fx%3D1%26y%3Dtwo
```

Output:

```text
hello world/?x=1&y=two
```

Notice: `URL Decoded.`

Invalid input is left unchanged:

Input:

```text
%E0%A4%A
```

Output:

```text
%E0%A4%A
```

Notice: `Error: Invalid URI sequence.`

### AI Note Summary

Why: Add or update a short `## Summary` section in the note body. Existing frontmatter is preserved.

AI metadata and tags are handled by Tundra, note renaming by Denali, and proofreading by Culebra.

### Restore Last Change

Why: Restore the most recent Torbert Text AI operation from the plugin history stack.

Restore can roll back text transformations, single-file changes, recursive folder changes, summary updates and folder classification when the previous file path is still available or can be recreated.
