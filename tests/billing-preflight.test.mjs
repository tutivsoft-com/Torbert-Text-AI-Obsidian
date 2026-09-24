import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const mainSource = await readFile(new URL("../src/main.ts", import.meta.url), "utf8");
const billingSource = await readFile(new URL("../src/billing.ts", import.meta.url), "utf8");

test("Torbert checks account character eligibility before starting an AI transformation", () => {
  const workflow = mainSource.slice(mainSource.indexOf("async applyTransformationToEditor("));
  assert.ok(workflow.indexOf("checkCharactersAvailable") >= 0);
  assert.ok(workflow.indexOf("checkCharactersAvailable") < workflow.indexOf("collectAiUsageDuring"));
});

test("Torbert preflight verifies free or purchased balance without claiming usage", () => {
  const start = billingSource.indexOf("export async function checkCharactersAvailable(");
  const end = billingSource.indexOf("export type SpendResult", start);
  const preflight = billingSource.slice(start, end);
  assert.match(preflight, /free_usage\?\.remaining/);
  assert.match(preflight, /credits\?\.balance/);
  assert.doesNotMatch(preflight, /claimAccountFreeUsage|spendConstanceCredits/);
  assert.match(preflight, /No AI request was sent/);
});
