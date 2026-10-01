import { Notice, requestUrl } from "obsidian";
import type TorbertTextAiPlugin from "./main";
import { spendAccountCredits, ensureBillingAccessToken, clearBillingSession } from "./constance-account";

const BASE_URL = "https://app.tutivsoft.com";
// Distinct from the "torbert-text-ai" app_id used by the separate
// saas-python-python-torbert-text-ai webapp (subscription billing) -- the two
// products collided on the same app_id in the Constance catalog, which broke
// checkout for this plugin. See CONSTANCE_BILLING_ROLLOUT.md, 2026-08-20.
const APP_ID = "torbert-text-ai-obsidian";
const adapterFor = (plugin: TorbertTextAiPlugin) => ({ state: plugin.settings, appId: APP_ID, installationId: plugin.settings.constanceDeviceId, persist: () => plugin.saveSettings(), syncBalance: async () => {} });

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
    if (!pending || pending.checkoutId !== checkoutId || !plugin.settings.billingRefreshToken) return;
    try {
      const token = await ensureBillingAccessToken(adapterFor(plugin));
      if (!token) return;
      const response = await requestUrl({
        url: `${BASE_URL}/api/v1/billing/checkouts/${encodeURIComponent(checkoutId)}`,
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        throw: false,
      });
      if (response.status === 401 || response.status === 403) {
        await clearBillingSession(adapterFor(plugin));
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

async function startCheckout(plugin: TorbertTextAiPlugin, planCode: "standard" | "pro" | "ultimate", openBrowser = true): Promise<void> {
  if (!plugin.settings.billingRefreshToken || !plugin.settings.billingAccountLinked) {
    new Notice("Sign in or create a billing account in Torbert settings before buying characters.");
    return;
  }
  if (plugin.settings.pendingCheckout && plugin.settings.pendingCheckout.planCode !== planCode) { new Notice("A purchase is pending. Wait for its status before starting another."); return; }
  const pending = plugin.settings.pendingCheckout?.planCode === planCode
    ? plugin.settings.pendingCheckout
    : { idempotencyKey: `checkout_${generateEventId()}`, planCode };
  plugin.settings.pendingCheckout = pending;
  await plugin.saveSettings();
  const token = await ensureBillingAccessToken(adapterFor(plugin));
  if (!token) { new Notice("Torbert: sign in again to buy characters."); return; }
  const response = await requestUrl({
    url: `${BASE_URL}/api/v1/billing/checkout`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": pending.idempotencyKey,
    },
    body: JSON.stringify({ app_id: APP_ID, plan_code: planCode, installation_id: plugin.settings.constanceDeviceId, quantity: 1 }),
    throw: false,
  });
  if (response.status === 401 || response.status === 403) {
    await clearBillingSession(adapterFor(plugin));
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
  if (openBrowser) window.open(checkoutUrl, "_blank", "noopener");
  void pollCheckoutSettlement(plugin, checkoutId);
}

export function resumePendingCheckout(plugin: TorbertTextAiPlugin): void {
  const pending = plugin.settings.pendingCheckout;
  if (!pending) return;
  if (pending.checkoutId) void pollCheckoutSettlement(plugin, pending.checkoutId);
  else void startCheckout(plugin, pending.planCode as "standard" | "pro" | "ultimate", false);
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
  const token = await ensureBillingAccessToken(adapterFor(plugin));
  if (!token) throw new Error("Billing session expired");
  const response = await requestUrl({
    url: `${BASE_URL}/api/v1/billing/entitlements/me?${new URLSearchParams({ app_id: APP_ID, installation_id: plugin.settings.constanceDeviceId }).toString()}`,
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    throw: false,
  });
  if (response.status === 401 || response.status === 403 || response.status === 404) {
    await clearBillingSession(adapterFor(plugin));
    await plugin.saveSettings();
  }
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Entitlement sync failed: HTTP ${response.status}`);
  }
  return response.json?.data;
}

/** Verify free or purchased character eligibility before a billable AI call. */
export async function checkCharactersAvailable(plugin: TorbertTextAiPlugin, amount: number): Promise<boolean> {
  if (!plugin.settings.billingRefreshToken || !plugin.settings.billingAccountLinked) {
    new Notice("Torbert: sign in or create a billing account in plugin settings before running AI.");
    return false;
  }
  await retryPendingSpendEvents(plugin);
  if (plugin.settings.pendingSpendEvents.length > 0) {
    new Notice("Torbert: a previous credit spend is still being reconciled. No AI request was sent.");
    return false;
  }
  try {
    const entitlement = await fetchConstanceEntitlements(plugin);
    const freeRemaining = Math.max(0, Number(entitlement?.free_usage?.remaining) || 0);
    const purchasedBalance = Math.max(0, Number(entitlement?.credits?.balance) || 0);
    plugin.settings.freeCharacters = freeRemaining;
    plugin.settings.purchasedCharacters = purchasedBalance;
    await plugin.saveSettings();
    if (freeRemaining >= amount || purchasedBalance >= amount) return true;
    new Notice("Torbert: not enough free or purchased characters. No AI request was sent.");
    return false;
  } catch {
    if (!plugin.settings.billingRefreshToken || !plugin.settings.billingAccountLinked) {
      new Notice("Torbert: your billing session expired. Sign in again before running AI.");
    } else {
      new Notice("Torbert: billing could not be verified. No AI request was sent.");
    }
    return false;
  }
}

export type SpendResult =
  | { kind: "ok"; balance: number }
  | { kind: "insufficient" }
  | { kind: "error" };

export async function spendConstanceCredits(plugin: TorbertTextAiPlugin, amount: number, stableEventId = generateEventId()): Promise<SpendResult> {
  const result = await spendAccountCredits(adapterFor(plugin), APP_ID, plugin.settings.constanceDeviceId, stableEventId, amount);
  if (result.kind === "auth-required") { await clearBillingSession(adapterFor(plugin)); return { kind: "error" }; }
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

export async function syncPurchasedCharactersFromConstance(plugin: TorbertTextAiPlugin, manual = false): Promise<void> {
  if (!plugin.settings.constanceDeviceId) {
    return;
  }
  try {
    if (!plugin.settings.billingRefreshToken || !plugin.settings.billingAccountLinked) { if (manual) throw new Error("Connect your billing account before refreshing credits."); return; }
    const entitlement = await fetchConstanceEntitlements(plugin);
    const serverBalance = entitlement?.credits?.balance;
    if (!Number.isFinite(serverBalance)) throw new Error("Billing returned an invalid balance");
    plugin.settings.freeCharacters = Math.max(0, Number(entitlement?.free_usage?.remaining) || 0);
    plugin.settings.purchasedCharacters = Math.max(0, Number(serverBalance) || 0);
    await plugin.saveSettings();
  } catch (error) {
    if (manual) throw error;
    console.error("Torbert: Constance entitlement sync failed", error);
  }
}
