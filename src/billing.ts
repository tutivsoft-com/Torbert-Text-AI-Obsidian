import { Notice, requestUrl } from "obsidian";
import type TorbertTextAiPlugin from "./main";

const BASE_URL = "https://app.tutivsoft.com";
const APP_ID = "torbert-text-ai";

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

function generateEventId(): string {
  const bytes = new Uint8Array(12);
  window.crypto.getRandomValues(bytes);
  return "evt_" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function fetchConstanceEntitlements(deviceId: string): Promise<any> {
  const response = await requestUrl({
    url: `${BASE_URL}/api/v1/public/browser/entitlements`,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      app_id: APP_ID,
      external_customer_id: deviceId,
      machine_id: deviceId,
    }),
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

export async function spendConstanceCredits(deviceId: string, amount: number): Promise<SpendResult> {
  try {
    const response = await requestUrl({
      url: `${BASE_URL}/api/v1/public/browser/credits/spend`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app_id: APP_ID,
        external_customer_id: deviceId,
        machine_id: deviceId,
        amount,
        event_id: generateEventId(),
      }),
      throw: false,
    });

    // 402 = confirmed insufficient balance. 404 = no Constance customer
    // exists yet for this device (i.e. never purchased) -- also a
    // confirmed "0 purchased characters" state, not a transient failure, so
    // it must block rather than fail open (otherwise a user who never
    // buys anything would get unlimited usage forever once their free
    // pool ran out).
    if (response.status === 402 || response.status === 404) {
      return { kind: "insufficient" };
    }
    if (response.status < 200 || response.status >= 300) {
      return { kind: "error" };
    }

    const balance = response.json?.data?.credits?.balance;
    return { kind: "ok", balance: Math.max(0, Number(balance) || 0) };
  } catch (error) {
    console.error("Torbert: Constance credit spend call failed", error);
    return { kind: "error" };
  }
}

export async function syncPurchasedCharactersFromConstance(plugin: TorbertTextAiPlugin): Promise<void> {
  if (!plugin.settings.constanceDeviceId) {
    return;
  }
  try {
    const entitlement = await fetchConstanceEntitlements(plugin.settings.constanceDeviceId);
    const serverBalance = entitlement?.credits?.balance;
    plugin.settings.purchasedCharacters = Math.max(0, Number(serverBalance) || 0);
    await plugin.saveSettings();
  } catch (error) {
    console.error("Torbert: Constance entitlement sync failed", error);
  }
}
