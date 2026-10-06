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
  const section = root.createDiv({ cls: "ui-billing-packs" });
  renderLoyaltyDiscount(section);
  const status = section.createEl("p", { text: "Loading prices…" });
  const appId = APP_ID;
  void diagnostics.guard("billing.background_1", () => ((diagnostics?.request?.("network.billing.addLivePacks", requestUrl, { url: `${BASE_URL}/api/v1/billing/public-products?app_id=${encodeURIComponent(appId)}`, method: "GET", throw: false }) ?? requestUrl({ url: `${BASE_URL}/api/v1/billing/public-products?app_id=${encodeURIComponent(appId)}`, method: "GET", throw: false })).then(async productsResponse => {
const diagnosticEnd1 = diagnostics?.start?.("billing.background.2425") ?? (() => {});
try {

    if (productsResponse.status < 200 || productsResponse.status >= 300) throw new Error(`Prices are temporarily unavailable. Try again shortly.`);
    const offers = joinPublicPacks(productsResponse.json?.data, appId);
    if (!offers.length) throw new Error("No credit packs are currently available.");
    status.setText("Applicable taxes are calculated at checkout.");
    for (const { pack, priceId, units, unit, amount, available } of offers) {
      const description = [
        pack?.description,
        Number.isSafeInteger(units) && units > 0 ? `${units.toLocaleString()} ${unit}` : "",
        available ? "" : pack?.availability_reason || "Current price unavailable",
      ].filter(Boolean).join(" · ");
      const row = new Setting(section).setName(pack.price_name || pack.name || pack.code || "Credit pack").setDesc(description);
      row.addButton((button) => button
        .setButtonText(available ? `Buy ${amount}` : "Pricing unavailable")
        .setDisabled(!available)
        .onClick(async () => {
return diagnostics.guard("billing.control_2", async () => {
const diagnosticEnd2 = diagnostics?.start?.("control.3491.onClick") ?? (() => {});
try {

          button.setDisabled(true);
          try {
            const state = plugin.settings as typeof plugin.settings & {
              pendingPaddleCheckout?: LivePricePendingCheckout;
              previewPendingCheckout?: LivePricePendingCheckout;
            };
            let pending = state.pendingPaddleCheckout || state.previewPendingCheckout;
            if (pending && state.previewPendingCheckout) {
              state.pendingPaddleCheckout = pending;
              state.previewPendingCheckout = undefined;
              await plugin.saveSettings();
            }
            if (pending?.owner && pending.owner !== plugin.settings.billingEmail) {
              throw new Error("Sign in to the account owning the pending purchase.");
            }
            if (pending?.checkout_id) {
              const token = await ensureBillingAccessToken(adapterFor(plugin));
              if (!token) throw new Error("Sign in again to check the pending purchase.");
              const response = await (diagnostics?.request?.("network.billing.addLivePacks", requestUrl, {
                url: `${BASE_URL}/api/v1/billing/checkouts/${encodeURIComponent(pending.checkout_id)}`,
                method: "GET",
                headers: { Authorization: `Bearer ${token}` },
                throw: false,
              }) ?? requestUrl({
                url: `${BASE_URL}/api/v1/billing/checkouts/${encodeURIComponent(pending.checkout_id)}`,
                method: "GET",
                headers: { Authorization: `Bearer ${token}` },
                throw: false,
              }));
              if (response.status >= 200 && response.status < 300) {
                const data = response.json?.data;
                if (data?.settled === true || ["completed", "canceled", "cancelled", "failed", "expired"].includes(data?.status)) {
                  state.pendingPaddleCheckout = undefined;
                  await plugin.saveSettings();
                  await syncPurchasedCharactersFromConstance(plugin);
                  if (data?.settled !== true && data?.status !== "completed") {
                    new Notice("The previous purchase did not complete. Your current balance was refreshed.");
                  } else {
                    new Notice("Torbert: payment settled and your character balance was refreshed.", 5000);
                  }
                  return;
                }
              }
            }
            if (pending && pending.price_id && pending.price_id !== priceId) {
              throw new Error("A purchase is pending. Resolve its status before starting another.");
            }
            const legacyPlan = pending && !pending.price_id ? pending.plan_code : undefined;
            const request: LivePricePendingCheckout = pending || {
              price_id: priceId,
              idempotency_key: `checkout_${generateEventId()}`,
              owner: plugin.settings.billingEmail,
            };
            state.pendingPaddleCheckout = request;
            await plugin.saveSettings();
            const token = await ensureBillingAccessToken(adapterFor(plugin));
            if (!token) throw new Error("Sign in again before buying characters.");
            const response = await (diagnostics?.request?.("network.billing.addLivePacks", requestUrl, {
              url: `${BASE_URL}/api/v1/billing/${legacyPlan ? "checkout" : "checkout-price"}`,
              method: "POST",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Idempotency-Key": request.idempotency_key },
              body: JSON.stringify(legacyPlan
                ? { app_id: appId, installation_id: plugin.settings.constanceDeviceId, plan_code: legacyPlan, quantity: 1 }
                : { app_id: appId, installation_id: plugin.settings.constanceDeviceId, price_id: request.price_id, quantity: 1 }),
              throw: false,
            }) ?? requestUrl({
              url: `${BASE_URL}/api/v1/billing/${legacyPlan ? "checkout" : "checkout-price"}`,
              method: "POST",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Idempotency-Key": request.idempotency_key },
              body: JSON.stringify(legacyPlan
                ? { app_id: appId, installation_id: plugin.settings.constanceDeviceId, plan_code: legacyPlan, quantity: 1 }
                : { app_id: appId, installation_id: plugin.settings.constanceDeviceId, price_id: request.price_id, quantity: 1 }),
              throw: false,
            }));
            if (response.status === 401 || response.status === 403) throw new Error("Your session expired. Sign in again.");
            if (response.status < 200 || response.status >= 300) {
              throw new Error(response.json?.detail?.message || "Checkout unavailable. Refresh current prices and retry.");
            }
            const checkout = response.json?.data;
            if (!checkout?.checkout_id) throw new Error("Checkout is still being confirmed. Retry the same purchase to recover it safely.");
            request.checkout_id = String(checkout.checkout_id);
            await plugin.saveSettings();
            if (typeof checkout.checkout_url === "string" && checkout.checkout_url) window.open(checkout.checkout_url, "_blank", "noopener");
            else new Notice("Checkout is being confirmed. Its status will refresh when you return.");
            void diagnostics.guard("billing.background_3", () => (pollPaddleCheckoutSettlement(plugin, request.checkout_id!)));
          } catch (error) {
diagnostics.failure("billing.caught_4", error);
            new Notice(error instanceof Error ? error.message : "Checkout unavailable.");
          } finally {
            button.setDisabled(!available);
          }

} catch (diagnosticError2) { diagnostics?.failure?.("control.3491.onClick", diagnosticError2); throw diagnosticError2; } finally { diagnosticEnd2(); }

});
}));
    }

} catch (diagnosticError1) { diagnostics?.failure?.("billing.background.2425", diagnosticError1); throw diagnosticError1; } finally { diagnosticEnd1(); }
}).catch((rejectedError1) => { diagnostics.failure("billing.rejected_2", rejectedError1); return (status.setText("Pricing temporarily unavailable. Refresh the current prices before buying.")); })));
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
        url: `${BASE_URL}/api/v1/billing/checkouts/${encodeURIComponent(checkoutId)}`,
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        throw: false,
      }) ?? requestUrl({
        url: `${BASE_URL}/api/v1/billing/checkouts/${encodeURIComponent(checkoutId)}`,
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
  const pending = (plugin.settings as typeof plugin.settings & { pendingPaddleCheckout?: LivePricePendingCheckout }).pendingPaddleCheckout;
  if (pending?.checkout_id) void diagnostics.guard("billing.background_6", () => (pollPaddleCheckoutSettlement(plugin, pending.checkout_id!)));
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
        url: `${BASE_URL}/api/v1/billing/checkouts/${encodeURIComponent(checkoutId)}`,
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        throw: false,
      }) ?? requestUrl({
        url: `${BASE_URL}/api/v1/billing/checkouts/${encodeURIComponent(checkoutId)}`,
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
    url: `${BASE_URL}/api/v1/billing/checkout`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": pending.idempotencyKey,
    },
    body: JSON.stringify({ app_id: APP_ID, plan_code: planCode, installation_id: plugin.settings.constanceDeviceId, quantity: 1 }),
    throw: false,
  }) ?? requestUrl({
    url: `${BASE_URL}/api/v1/billing/checkout`,
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
  const pending = plugin.settings.pendingCheckout;
  if (!pending) return;
  if (pending.checkoutId) void diagnostics.guard("billing.background_8", () => (pollCheckoutSettlement(plugin, pending.checkoutId!)));
  else void diagnostics.guard("billing.background_9", () => (startCheckout(plugin, pending.planCode as "standard" | "pro" | "ultimate", false)));
}

export function openCheckout(plugin: TorbertTextAiPlugin, tier: TorbertPackKey): void {
  void diagnostics.guard("billing.background_10", () => (startCheckout(plugin, TORBERT_PLAN_CODES[tier]).catch((error) => {
diagnostics.failure("billing.rejected_3", error);
    diagnostics?.legacy?.("error", "billing.torbert_authenticated_checkout_failed");
    new Notice("Torbert: checkout could not be started. Retry from settings.");
  })));
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
    url: `${BASE_URL}/api/v1/billing/entitlements/me?${new URLSearchParams({ app_id: APP_ID, installation_id: plugin.settings.constanceDeviceId }).toString()}`,
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    throw: false,
  }) ?? requestUrl({
    url: `${BASE_URL}/api/v1/billing/entitlements/me?${new URLSearchParams({ app_id: APP_ID, installation_id: plugin.settings.constanceDeviceId }).toString()}`,
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
const diagnosticEnd7 = diagnostics?.start?.("billing.checkCharactersAvailable") ?? (() => {});
try {

  if (!plugin.settings.billingRefreshToken || !plugin.settings.billingAccountLinked) {
    new Notice("Torbert: sign in or create an account in plugin settings before running AI.");
    return false;
  }
  await retryPendingSpendEvents(plugin);
  if (plugin.settings.pendingSpendEvents.length > 0) {
    new Notice("Torbert: a previous charge is still being confirmed. No AI request was sent.");
    return false;
  }
  try {
    const entitlement = await fetchConstanceEntitlements(plugin);
    const freeRemaining = Math.max(0, Number(entitlement?.free_usage?.remaining) || 0);
    const purchasedBalance = Math.max(0, Number((entitlement?.credits?.total_available ?? entitlement?.credits?.balance)) || 0);
    plugin.settings.freeCharacters = freeRemaining;
    plugin.settings.purchasedCharacters = purchasedBalance;
    await plugin.saveSettings();
    if (freeRemaining + purchasedBalance >= amount) return true;
    new Notice("Torbert: not enough free or purchased characters. No AI request was sent.");
    return false;
  } catch (caughtError11) {
diagnostics.failure("billing.caught_12", caughtError11);
    if (!plugin.settings.billingRefreshToken || !plugin.settings.billingAccountLinked) {
      new Notice("Torbert: your session expired. Sign in again before running AI.");
    } else {
      new Notice("Torbert: your account could not be verified. No AI request was sent.");
    }
    return false;
  }

} catch (diagnosticError7) { diagnostics?.failure?.("billing.checkCharactersAvailable", diagnosticError7); throw diagnosticError7; } finally { diagnosticEnd7(); }
}

export type SpendResult =
  | { kind: "ok"; balance: number }
  | { kind: "insufficient" }
  | { kind: "error" };

export async function spendConstanceCredits(plugin: TorbertTextAiPlugin, amount: number, stableEventId = generateEventId()): Promise<SpendResult> {
const diagnosticEnd8 = diagnostics?.start?.("billing.spendConstanceCredits") ?? (() => {});
try {

  if (stableEventId.startsWith("consume_")) {
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
const diagnosticEnd9 = diagnostics?.start?.("billing.retryPendingSpendEvents") ?? (() => {});
try {

  for (const pending of [...(plugin.settings.pendingSpendEvents ?? [])]) {
    const result = await spendConstanceCredits(plugin, pending.amount, pending.eventId);
    if (result.kind === "error") break;
    plugin.settings.pendingSpendEvents = plugin.settings.pendingSpendEvents.filter((item) => item.eventId !== pending.eventId);
    plugin.settings.purchasedCharacters = result.kind === "ok" ? result.balance : 0;
    await plugin.saveSettings();
  }

} catch (diagnosticError9) { diagnostics?.failure?.("billing.retryPendingSpendEvents", diagnosticError9); throw diagnosticError9; } finally { diagnosticEnd9(); }
}

export async function syncPurchasedCharactersFromConstance(plugin: TorbertTextAiPlugin, manual = false): Promise<void> {
const diagnosticEnd10 = diagnostics?.start?.("billing.syncPurchasedCharactersFromConstance") ?? (() => {});
try {

  if (!plugin.settings.constanceDeviceId) {
    return;
  }
  try {
    if (!plugin.settings.billingRefreshToken || !plugin.settings.billingAccountLinked) { if (manual) throw new Error("Connect your account before refreshing credits."); return; }
    const entitlement = await fetchConstanceEntitlements(plugin);
    const serverBalance = (entitlement?.credits?.total_available ?? entitlement?.credits?.balance);
    const freeRemaining = entitlement?.free_usage?.remaining;
    if (!Number.isFinite(serverBalance) || serverBalance < 0 || !Number.isFinite(freeRemaining) || freeRemaining < 0) throw new Error("Your balance could not be updated. Refresh it and try again.");
    plugin.settings.freeCharacters = freeRemaining;
    plugin.settings.purchasedCharacters = Math.max(0, Number(serverBalance) || 0);
    await plugin.saveSettings();
    plugin.refreshBillingCredits?.();
  } catch (error) {
diagnostics.failure("billing.caught_13", error);
    if (manual) throw error;
    diagnostics?.legacy?.("error", "billing.torbert_constance_entitlement_sync_failed");
  }

} catch (diagnosticError10) { diagnostics?.failure?.("billing.syncPurchasedCharactersFromConstance", diagnosticError10); throw diagnosticError10; } finally { diagnosticEnd10(); }
}
