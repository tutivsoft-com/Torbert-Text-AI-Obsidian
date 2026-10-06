import { diagnostics } from "./diagnostics";
import { requestUrl } from "obsidian";

export interface AccountCreditHost {
  state: { billingAccountLinked: boolean; billingAccessToken: string; billingRefreshToken: string };
  appId: string;
  installationId: string;
  refreshSession: () => Promise<boolean>;
}
export type AccountCreditResult =
  | { kind: "ok"; freeUnits: number; paidUnits: number; freeRemaining?: number; balance?: number }
  | { kind: "insufficient" | "auth-required" | "error" };

/** One authenticated, atomic operation: account lifetime allowance first, purchased units next. */
export async function consumeAccountUnits(host: AccountCreditHost, eventId: string, amount: number): Promise<AccountCreditResult> {
const diagnosticEnd1 = diagnostics?.start?.("account-credit-client.consumeAccountUnits") ?? (() => {});
try {

  if (!host.state.billingAccountLinked || !host.installationId) return { kind: "auth-required" };
  if (!Number.isSafeInteger(amount) || amount <= 0 || !eventId) return { kind: "error" };
  if (!host.state.billingAccessToken && !await host.refreshSession()) return { kind: host.state.billingRefreshToken ? "error" : "auth-required" };
  const send = () => (diagnostics?.request?.("network.account-credit-client.consumeAccountUnits", requestUrl, { url: "https://app.tutivsoft.com/api/v1/billing/usage/consume", method: "POST", throw: false,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${host.state.billingAccessToken}` },
    body: JSON.stringify({ app_id: host.appId, installation_id: host.installationId, event_id: eventId, amount }) }) ?? requestUrl({ url: "https://app.tutivsoft.com/api/v1/billing/usage/consume", method: "POST", throw: false,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${host.state.billingAccessToken}` },
    body: JSON.stringify({ app_id: host.appId, installation_id: host.installationId, event_id: eventId, amount }) }));
  try {
    let response = await send();
    if (response.status === 401 && host.state.billingRefreshToken) {
      if (!await host.refreshSession()) return { kind: host.state.billingRefreshToken ? "error" : "auth-required" };
      response = await send();
    }
    if (response.status === 402) return { kind: "insufficient" };
    if (response.status === 401 || response.status === 403) return { kind: "auth-required" };
    if (response.status < 200 || response.status >= 300) return { kind: "error" };
    const data = response.json?.data;
    if (data?.state !== "committed" || data.app_id !== host.appId || data.installation_id !== host.installationId || data.event_id !== eventId || data.amount !== amount || !Number.isSafeInteger(data.free_units) || !Number.isSafeInteger(data.paid_units) || data.free_units < 0 || data.paid_units < 0 || (data.free_units + data.paid_units !== amount && !(data.retained_access === true && data.free_units === 0 && data.paid_units === 0 && (data.legacy_units ?? 0) === 0))) return { kind: "error" };
    const freeRemaining = Number(data.free_usage?.remaining), balance = Number(data.credits?.total_available ?? data.credits?.balance);
    return { kind: "ok", freeUnits: data.free_units, paidUnits: data.paid_units,
      ...(Number.isFinite(freeRemaining) ? { freeRemaining: Math.max(0, freeRemaining) } : {}),
      ...(Number.isFinite(balance) ? { balance: Math.max(0, balance) } : {}) };
  } catch (caughtError1) {
diagnostics.failure("account-credit-client.caught_2", caughtError1); return { kind: "error" }; }

} catch (diagnosticError1) { diagnostics?.failure?.("account-credit-client.consumeAccountUnits", diagnosticError1); throw diagnosticError1; } finally { diagnosticEnd1(); }
}
