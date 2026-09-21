import { Notice, requestUrl } from "obsidian";
import type TorbertTextAiPlugin from "./main";
import { spendAccountCredits } from "./constance-account";

const BASE_URL = "https://app.tutivsoft.com";
// Distinct from the "torbert-text-ai" app_id used by the separate
// saas-python-python-torbert-text-ai webapp (subscription billing) -- the two
// products collided on the same app_id in the Constance catalog, which broke
// checkout for this plugin. See CONSTANCE_BILLING_ROLLOUT.md, 2026-08-20.
const APP_ID = "torbert-text-ai-obsidian";

// One-time credit packs only (no subscriptions, no license keys). Balance
// reads and spends require the authenticated Constance account session.
export type TorbertPackKey = "usd_001" | "usd_005" | "usd_015";

const TORBERT_PLAN_CODES: Record<TorbertPackKey, "standard" | "pro" | "ultimate"> = {
  usd_001: "standard",
  usd_005: "pro",
  usd_015: "ultimate",
};

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function pollCheckoutSettlement(plugin: TorbertTextAiPlugin, checkoutId: string): Promise<void> {
  for (let attempt = 0; attempt < 12; attempt++) {
    await wait(5000);
    const pending = plugin.settings.pendingCheckout;
    if (!pending || pending.checkoutId !== checkoutId || !plugin.settings.billingAccessToken) return;
    try {
      const response = await requestUrl({
        url: `${BASE_URL}/api/v1/billing/checkouts/${encodeURIComponent(checkoutId)}`,
        method: "GET",
        headers: { Authorization: `Bearer ${plugin.settings.billingAccessToken}` },
        throw: false,
      });
      if (response.status === 401 || response.status === 403) {
        plugin.settings.billingAccessToken = "";
        plugin.settings.billingAccountLinked = false;
        plugin.settings.pendingCheckout = null;
        await plugin.saveSettings();
        return;
      }
      if (response.status < 200 || response.status >= 300) continue;
      if (response.json?.data?.settled === true) {
        plugin.settings.pendingCheckout = null;
        await plugin.saveSettings();
        await syncPurchasedCharactersFromConstance(plugin);
        new Notice("Torbert: payment settled and your character balance was refreshed.", 5000);
        return;
      }
    } catch (error) {
      console.warn("Torbert: checkout settlement poll failed", error);
    }
  }
}

async function startCheckout(plugin: TorbertTextAiPlugin, planCode: "standard" | "pro" | "ultimate"): Promise<void> {
  if (!plugin.settings.billingAccessToken || !plugin.settings.billingAccountLinked) {
    new Notice("Sign in or create a billing account in Torbert settings before buying characters.");
    return;
  }
  const pending = plugin.settings.pendingCheckout?.planCode === planCode
    ? plugin.settings.pendingCheckout
    : { idempotencyKey: `checkout_${generateEventId()}`, planCode };
  plugin.settings.pendingCheckout = pending;
  await plugin.saveSettings();
  const response = await requestUrl({
    url: `${BASE_URL}/api/v1/billing/checkout`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${plugin.settings.billingAccessToken}`,
      "Idempotency-Key": pending.idempotencyKey,
    },
    body: JSON.stringify({ app_id: APP_ID, plan_code: planCode, installation_id: plugin.settings.constanceDeviceId, quantity: 1 }),
    throw: false,
  });
  if (response.status === 401 || response.status === 403) {
    plugin.settings.billingAccessToken = "";
    plugin.settings.billingAccountLinked = false;
    plugin.settings.pendingCheckout = null;
    await plugin.saveSettings();
    new Notice("Torbert: your billing session expired. Sign in again.");
    return;
  }
  if (response.status < 200 || response.status >= 300) {
    new Notice(`Torbert: checkout could not be created (HTTP ${response.status}).`);
    return;
  }
  const data = response.json?.data;
  const checkoutId = String(data?.checkout_id || data?.id || "");
  const checkoutUrl = String(data?.checkout_url || "");
  if (!checkoutId || !checkoutUrl) {
    new Notice("Torbert: Constance returned an incomplete checkout response.");
    return;
  }
  plugin.settings.pendingCheckout = { ...pending, checkoutId };
  await plugin.saveSettings();
  window.open(checkoutUrl, "_blank");
  void pollCheckoutSettlement(plugin, checkoutId);
}

export function resumePendingCheckout(plugin: TorbertTextAiPlugin): void {
  const pending = plugin.settings.pendingCheckout;
  if (!pending) return;
  if (pending.checkoutId) void pollCheckoutSettlement(plugin, pending.checkoutId);
  else void startCheckout(plugin, pending.planCode as "standard" | "pro" | "ultimate");
}

export function openCheckout(plugin: TorbertTextAiPlugin, tier: TorbertPackKey): void {
  void startCheckout(plugin, TORBERT_PLAN_CODES[tier]).catch((error) => {
    console.error("Torbert: authenticated checkout failed", error);
    new Notice("Torbert: checkout could not be started. Retry from settings.");
  });
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
