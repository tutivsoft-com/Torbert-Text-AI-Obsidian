import { Notice, requestUrl } from "obsidian";
import type TorbertTextAiPlugin from "./main";
import { spendAccountCredits } from "./constance-account";

const BASE_URL = "https://app.tutivsoft.com";
// Distinct from the "torbert-text-ai" app_id used by the separate
// saas-python-python-torbert-text-ai webapp (subscription billing) -- the two
// products collided on the same app_id in the Constance catalog, which broke
// checkout for this plugin. See CONSTANCE_BILLING_ROLLOUT.md, 2026-08-20.
const APP_ID = "torbert-text-ai-obsidian";

// One-time credit packs only (no subscriptions, no license keys). Uses the
// unsigned public browser-relay endpoints, the same model Culebra uses:
// checkout via GET /buy, balance reads via POST /public/browser/entitlements,
// balance spend via POST /public/browser/credits/spend. The identity is this
// install's own constanceDeviceId, reused as both external_customer_id and
// machine_id (the "unsigned same-install lookup" those endpoints require).
export type TorbertPackKey = "usd_001" | "usd_005" | "usd_015";

export const TORBERT_PRICE_IDS: Record<TorbertPackKey, string> = {
  usd_001: "pri_01m0ced0t5541gpxqn2arcsbb0", // $1  -> 20,000 characters
  usd_005: "pri_01m0ced26nc1vw1sqmb4a3rg77", // $5  -> 160,000 characters
  usd_015: "pri_01m0ced3hwwp329w0ejtfp1f94", // $15 -> 640,000 characters
};

export function openCheckout(plugin: TorbertTextAiPlugin, tier: TorbertPackKey): void {
  if (!plugin.settings.billingAccessToken || !plugin.settings.billingAccountLinked) { new Notice("Sign in or create a billing account in Torbert settings before buying characters."); return; }
  const email = plugin.settings.billingEmail.trim();
  if (!email || !email.includes("@")) {
    new Notice("Enter a valid billing email in Torbert settings first.");
    return;
  }

  const priceId: string = TORBERT_PRICE_IDS[tier];
  if (!priceId || priceId === "PENDING_PROVISIONING") {
    new Notice("Torbert billing is not available for this pack yet.");
    return;
  }

  const params = new URLSearchParams({
    app_id: APP_ID,
    price_id: priceId,
    email,
    external_customer_id: plugin.settings.constanceDeviceId,
  });
  window.open(`${BASE_URL}/buy?${params.toString()}`, "_blank");
  plugin.pollAfterCheckout();
}

export function generateEventId(): string {
  const bytes = new Uint8Array(12);
  window.crypto.getRandomValues(bytes);
  return "evt_" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function fetchConstanceEntitlements(plugin: TorbertTextAiPlugin): Promise<any> {
  const response = await requestUrl({
    url: `${BASE_URL}/api/v1/billing/entitlements/me?${new URLSearchParams({ app_id: APP_ID, installation_id: plugin.settings.constanceDeviceId }).toString()}`,
    method: "GET",
    headers: { Authorization: `Bearer ${plugin.settings.billingAccessToken}` },
    throw: false,
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Entitlement sync failed: HTTP ${response.status}`);
  }
  return response.json?.data;
}

export type SpendResult =
  | { kind: "ok"; balance: number }
  | { kind: "insufficient" }
  | { kind: "error" };

export async function spendConstanceCredits(plugin: TorbertTextAiPlugin, amount: number, stableEventId = generateEventId()): Promise<SpendResult> {
  const result = await spendAccountCredits(plugin.settings, APP_ID, plugin.settings.constanceDeviceId, stableEventId, amount);
  if (result.kind === "auth-required") { plugin.settings.billingAccessToken = ""; plugin.settings.billingAccountLinked = false; await plugin.saveSettings(); return { kind: "error" }; }
  return result.kind === "ok" || result.kind === "insufficient" || result.kind === "error" ? result : { kind: "error" };
}

export async function retryPendingSpendEvents(plugin: TorbertTextAiPlugin): Promise<void> {
  for (const pending of [...(plugin.settings.pendingSpendEvents ?? [])]) {
    const result = await spendConstanceCredits(plugin, pending.amount, pending.eventId);
    if (result.kind === "error") break;
    plugin.settings.pendingSpendEvents = plugin.settings.pendingSpendEvents.filter((item) => item.eventId !== pending.eventId);
    plugin.settings.purchasedCharacters = result.kind === "ok" ? result.balance : 0;
    await plugin.saveSettings();
  }
}

export async function syncPurchasedCharactersFromConstance(plugin: TorbertTextAiPlugin): Promise<void> {
  if (!plugin.settings.constanceDeviceId) {
    return;
  }
  try {
    if (!plugin.settings.billingAccessToken || !plugin.settings.billingAccountLinked) return;
    const entitlement = await fetchConstanceEntitlements(plugin);
    const serverBalance = entitlement?.credits?.balance;
    plugin.settings.purchasedCharacters = Math.max(0, Number(serverBalance) || 0);
    await plugin.saveSettings();
  } catch (error) {
    console.error("Torbert: Constance entitlement sync failed", error);
  }
}
