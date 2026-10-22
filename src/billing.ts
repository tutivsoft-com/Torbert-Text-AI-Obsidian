import {syncEntitlements} from "./constance-v2";
import {openAccountCheckout} from "./billing-checkout";
import {resumeAccountCheckout} from "./billing-checkout";
import {addLivePacks as renderLivePacks} from "./billing-catalog";
import { renderLoyaltyDiscount } from "./loyalty-discount";
import { diagnostics } from "./diagnostics";
import { consumeAccountUnits } from "./account-credit-client";
import { Notice, requestUrl, Setting } from "obsidian";
import type TorbertTextAiPlugin from "./main";
import { spendAccountCredits, ensureBillingAccessToken, clearBillingSession, refreshBillingSession } from "./constance-account";

const BASE_URL = "https://app.tutivsoft.com";
// Distinct from the "torbert-text-ai" app_id used by the separate
// saas-python-python-torbert-text-ai webapp (subscription billing) -- the two
// products collided on the same app_id in the Constance catalog, which broke
// checkout for this plugin. See CONSTANCE_BILLING_ROLLOUT.md, 2026-08-20.
const APP_ID = "torbert-text-ai-obsidian";
const adapterFor = (plugin: TorbertTextAiPlugin) => ({ state: plugin.settings, appId: APP_ID, installationId: plugin.settings.constanceDeviceId, persist: () => plugin.saveSettings(), syncBalance: async () => {} });

// One-time credit packs only (no subscriptions, no license keys). Balance
// reads and spends require the authenticated Account session.
export type TorbertPackKey = "usd_001" | "usd_005" | "usd_015";

interface LivePricePendingCheckout {
  owner?: string;
  price_id?: string;
  idempotency_key: string;
  checkout_id?: string;
  plan_code?: string;
}

/** Display current character packs and their Paddle display values from Constance. */
export function joinPublicPacks(products: any, appId = APP_ID): any[] {
  if (products?.app_id !== appId || !Array.isArray(products?.packs)) return [];
  return products.packs.map((pack: any) => {
    const priceId = typeof pack?.price_id === "string" ? pack.price_id : "";
    const units = Number(pack?.native_units);
    const unit = typeof pack?.unit === "string" && pack.unit.trim() ? pack.unit.trim() : "characters";
    const amount = typeof pack?.formatted_total === "string" ? pack.formatted_total : "";
    const available = pack?.available === true && !!priceId && Number.isSafeInteger(units) && units > 0 && !!amount;
    return { pack, priceId, units, unit, amount, available };
  });
}

export function addLivePacks(root: HTMLElement, plugin: TorbertTextAiPlugin): void {
renderLivePacks(root,{state:plugin.settings,appId:"torbert-text-ai-obsidian",installationId:plugin.settings.constanceDeviceId,persist:()=>plugin.saveSettings(),syncBalance:async()=>{await syncEntitlements(plugin.settings,()=>plugin.saveSettings());(plugin as any).refreshBillingCredits?.();}});
}

const TORBERT_PLAN_CODES: Record<TorbertPackKey, "standard" | "pro" | "ultimate"> = {
  usd_001: "standard",
  usd_005: "pro",
  usd_015: "ultimate",
};

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(diagnostics.wrap("billing.timer_5", resolve), milliseconds));
}

async function pollPaddleCheckoutSettlement(plugin: TorbertTextAiPlugin, checkoutId: string): Promise<void> {
const diagnosticEnd3 = diagnostics?.start?.("billing.pollPaddleCheckoutSettlement") ?? (() => {});
try {

  for (let attempt = 0; attempt < 12; attempt++) {
    await wait(5000);
    const state = plugin.settings as typeof plugin.settings & { pendingPaddleCheckout?: LivePricePendingCheckout };
    const pending = state.pendingPaddleCheckout;
    if (!pending || pending.checkout_id !== checkoutId || !plugin.settings.billingRefreshToken) return;
    try {
      const token = await ensureBillingAccessToken(adapterFor(plugin));
      if (!token) return;
      const response = await (diagnostics?.request?.("network.billing.pollPaddleCheckoutSettlement", requestUrl, {
        url: `${BASE_URL}/api/v2/billing/checkouts/${encodeURIComponent(checkoutId)}`,
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        throw: false,
      }) ?? requestUrl({
        url: `${BASE_URL}/api/v2/billing/checkouts/${encodeURIComponent(checkoutId)}`,
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        throw: false,
      }));
      if (response.status === 401 || response.status === 403) {
        await clearBillingSession(adapterFor(plugin));
        await plugin.saveSettings();
        return;
      }
      if (response.status < 200 || response.status >= 300) continue;
      const result = response.json?.data;
      const terminal = result?.settled === true || ["completed", "fulfilled", "failed", "canceled", "cancelled", "expired"].includes(result?.status);
      if (!terminal) continue;
      if (state.pendingPaddleCheckout !== pending) return;
      state.pendingPaddleCheckout = undefined;
      await plugin.saveSettings();
      await syncPurchasedCharactersFromConstance(plugin);
      new Notice(result?.settled === true || ["completed", "fulfilled"].includes(result?.status)
        ? "Torbert: payment settled and your character balance was refreshed."
        : "The previous purchase did not complete. Your current balance was refreshed.", 5000);
      return;
    } catch (error) {
diagnostics.failure("billing.caught_extra_1", error);
      diagnostics?.legacy?.("warn", "billing.torbert_paddle_checkout_settlement_poll_failed");
    }
  }

} catch (diagnosticError3) { diagnostics?.failure?.("billing.pollPaddleCheckoutSettlement", diagnosticError3); throw diagnosticError3; } finally { diagnosticEnd3(); }
}

export function resumePendingPaddleCheckout(plugin: TorbertTextAiPlugin): void {
resumeAccountCheckout({state:plugin.settings,appId:"torbert-text-ai-obsidian",installationId:plugin.settings.constanceDeviceId,persist:()=>plugin.saveSettings(),syncBalance:async()=>{await syncEntitlements(plugin.settings,()=>plugin.saveSettings());(plugin as any).refreshBillingCredits?.();},refreshSession:()=>refreshBillingSession(plugin.settings,()=>plugin.saveSettings())});
}

async function pollCheckoutSettlement(plugin: TorbertTextAiPlugin, checkoutId: string): Promise<void> {
const diagnosticEnd4 = diagnostics?.start?.("billing.pollCheckoutSettlement") ?? (() => {});
try {

  for (let attempt = 0; attempt < 12; attempt++) {
    await wait(5000);
    const pending = plugin.settings.pendingCheckout;
    if (!pending || pending.checkoutId !== checkoutId || !plugin.settings.billingRefreshToken) return;
    try {
      const token = await ensureBillingAccessToken(adapterFor(plugin));
      if (!token) return;
      const response = await (diagnostics?.request?.("network.billing.pollCheckoutSettlement", requestUrl, {
        url: `${BASE_URL}/api/v2/billing/checkouts/${encodeURIComponent(checkoutId)}`,
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        throw: false,
      }) ?? requestUrl({
        url: `${BASE_URL}/api/v2/billing/checkouts/${encodeURIComponent(checkoutId)}`,
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        throw: false,
      }));
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
diagnostics.failure("billing.caught_extra_2", error);
      diagnostics?.legacy?.("warn", "billing.torbert_checkout_settlement_poll_failed");
    }
  }

} catch (diagnosticError4) { diagnostics?.failure?.("billing.pollCheckoutSettlement", diagnosticError4); throw diagnosticError4; } finally { diagnosticEnd4(); }
}

async function startCheckout(plugin: TorbertTextAiPlugin, planCode: "standard" | "pro" | "ultimate", openBrowser = true): Promise<void> {
const diagnosticEnd5 = diagnostics?.start?.("billing.startCheckout") ?? (() => {});
try {

  if (!plugin.settings.billingRefreshToken || !plugin.settings.billingAccountLinked) {
    new Notice("Sign in or create an account in Torbert settings before buying characters.");
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
  const response = await (diagnostics?.request?.("network.billing.startCheckout", requestUrl, {
    url: `${BASE_URL}/api/v2/billing/checkout`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": pending.idempotencyKey,
    },
    body: JSON.stringify({ app_id: APP_ID, plan_code: planCode, installation_id: plugin.settings.constanceDeviceId, quantity: 1 }),
    throw: false,
  }) ?? requestUrl({
    url: `${BASE_URL}/api/v2/billing/checkout`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": pending.idempotencyKey,
    },
    body: JSON.stringify({ app_id: APP_ID, plan_code: planCode, installation_id: plugin.settings.constanceDeviceId, quantity: 1 }),
    throw: false,
  }));
  if (response.status === 401 || response.status === 403) {
    await clearBillingSession(adapterFor(plugin));
    await plugin.saveSettings();
    new Notice("Torbert: your session expired. Sign in again.");
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
    new Notice("Torbert: checkout could not be started. Try again from Settings.");
    return;
  }
  plugin.settings.pendingCheckout = { ...pending, checkoutId };
  await plugin.saveSettings();
  if (openBrowser) window.open(checkoutUrl, "_blank", "noopener");
  void diagnostics.guard("billing.background_7", () => (pollCheckoutSettlement(plugin, checkoutId)));

} catch (diagnosticError5) { diagnostics?.failure?.("billing.startCheckout", diagnosticError5); throw diagnosticError5; } finally { diagnosticEnd5(); }
}

export function resumePendingCheckout(plugin: TorbertTextAiPlugin): void {
resumeAccountCheckout({state:plugin.settings,appId:"torbert-text-ai-obsidian",installationId:plugin.settings.constanceDeviceId,persist:()=>plugin.saveSettings(),syncBalance:async()=>{await syncEntitlements(plugin.settings,()=>plugin.saveSettings());(plugin as any).refreshBillingCredits?.();},refreshSession:()=>refreshBillingSession(plugin.settings,()=>plugin.saveSettings())});
}

export function openCheckout(plugin: TorbertTextAiPlugin, tier: TorbertPackKey): void {
void openAccountCheckout({state:plugin.settings,appId:"torbert-text-ai-obsidian",installationId:plugin.settings.constanceDeviceId,persist:()=>plugin.saveSettings(),syncBalance:async()=>{await syncEntitlements(plugin.settings,()=>plugin.saveSettings());(plugin as any).refreshBillingCredits?.();},refreshSession:()=>refreshBillingSession(plugin.settings,()=>plugin.saveSettings())},"onetime");
}

export function generateEventId(): string {
  const bytes = new Uint8Array(12);
  window.crypto.getRandomValues(bytes);
  return "evt_" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function fetchConstanceEntitlements(plugin: TorbertTextAiPlugin): Promise<any> {
const diagnosticEnd6 = diagnostics?.start?.("billing.fetchConstanceEntitlements") ?? (() => {});
try {

  const token = await ensureBillingAccessToken(adapterFor(plugin));
  if (!token) throw new Error("Billing session expired");
  const response = await (diagnostics?.request?.("network.billing.fetchConstanceEntitlements", requestUrl, {
    url: `${BASE_URL}/api/v2/billing/entitlements/me?${new URLSearchParams({ app_id: APP_ID, installation_id: plugin.settings.constanceDeviceId }).toString()}`,
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    throw: false,
  }) ?? requestUrl({
    url: `${BASE_URL}/api/v2/billing/entitlements/me?${new URLSearchParams({ app_id: APP_ID, installation_id: plugin.settings.constanceDeviceId }).toString()}`,
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    throw: false,
  }));
  if (response.status === 401 || response.status === 403 || response.status === 404) {
    await clearBillingSession(adapterFor(plugin));
    await plugin.saveSettings();
  }
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Your account could not be updated. Check your connection and try again.`);
  }
  return await (response.json?.data);

} catch (diagnosticError6) { diagnostics?.failure?.("billing.fetchConstanceEntitlements", diagnosticError6); throw diagnosticError6; } finally { diagnosticEnd6(); }
}

/** Verify free or purchased character eligibility before a billable AI call. */
export async function checkCharactersAvailable(plugin: TorbertTextAiPlugin, amount: number): Promise<boolean> {
await syncEntitlements(plugin.settings,()=>plugin.saveSettings());return plugin.settings.freeCharacters+plugin.settings.purchasedCharacters>=amount;
}

export type SpendResult =
  | { kind: "ok"; balance: number }
  | { kind: "insufficient" }
  | { kind: "error" };

export async function spendConstanceCredits(plugin: TorbertTextAiPlugin, amount: number, stableEventId = generateEventId()): Promise<SpendResult> {
const diagnosticEnd8 = diagnostics?.start?.("billing.spendConstanceCredits") ?? (() => {});
try {

  if (stableEventId.startsWith("v2consume_")) {
    const result = await consumeAccountUnits({ state: plugin.settings, appId: APP_ID, installationId: plugin.settings.constanceDeviceId, refreshSession: () => refreshBillingSession(plugin.settings, () => plugin.saveSettings()) }, stableEventId, amount);
    if (result.kind === "ok") {
      plugin.settings.freeCharacters = result.freeRemaining ?? plugin.settings.freeCharacters;
      return { kind: "ok", balance: result.balance ?? plugin.settings.purchasedCharacters };
    }
    return { kind: result.kind === "insufficient" ? "insufficient" : "error" };
  }
  const result = await spendAccountCredits(adapterFor(plugin), APP_ID, plugin.settings.constanceDeviceId, stableEventId, amount);
  if (result.kind === "auth-required") { await clearBillingSession(adapterFor(plugin)); return { kind: "error" }; }
  return await (result.kind === "ok" || result.kind === "insufficient" || result.kind === "error" ? result : { kind: "error" });

} catch (diagnosticError8) { diagnostics?.failure?.("billing.spendConstanceCredits", diagnosticError8); throw diagnosticError8; } finally { diagnosticEnd8(); }
}

export async function retryPendingSpendEvents(plugin: TorbertTextAiPlugin): Promise<void> {
return;
}

export async function syncPurchasedCharactersFromConstance(plugin: TorbertTextAiPlugin, manual = false): Promise<void> {
await syncEntitlements(plugin.settings,()=>plugin.saveSettings());
(plugin as any).refreshBillingCredits?.();
}
