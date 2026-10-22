import { diagnostics } from "./diagnostics";
import { requestUrl } from "obsidian";
import { CONSTANCE_API, BILLING_UNIT, accountBalance } from "./constance-v2";

export interface AccountCreditHost {
  state: { billingAccountLinked: boolean; billingAccessToken: string; billingRefreshToken: string; billingEmail?: string };
  appId: string; installationId: string;
  refreshSession(): Promise<boolean>;
}
export type AccountCreditResult =
  | { kind: "ok"; freeUnits: number; paidUnits: number; freeRemaining?: number; balance?: number }
  | { kind: "insufficient" | "auth-required" | "error" };

/** The caller persists v2consume_ keys and their owner before the first request. */
export async function consumeAccountUnits(host: AccountCreditHost, eventId: string, amount: number): Promise<AccountCreditResult> {
  if (!host.state.billingAccountLinked || !host.installationId) return { kind: "auth-required" };
  if (!Number.isSafeInteger(amount) || amount <= 0 || !eventId.startsWith("v2consume_")) return { kind: "error" };
  const owner = host.state.billingEmail;
  const current = () => host.state.billingAccountLinked && host.state.billingEmail === owner;
  const send = async (path: string, body?: unknown): Promise<any> => {
    if (!current()) return { status: 401 };
    if (!host.state.billingAccessToken && !await host.refreshSession()) return { status: 401 };
    const request = () => requestUrl({ url: `${CONSTANCE_API}${path}`, method: body ? "POST" : "GET", throw: false,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${host.state.billingAccessToken}` }, ...(body ? { body: JSON.stringify(body) } : {}) });
    let response = await request();
    if (response.status === 401 && host.state.billingRefreshToken && await host.refreshSession() && current()) response = await request();
    return response;
  };
  const valid = (op: any) => op?.app_id === host.appId && op?.unit === BILLING_UNIT && op?.units === amount
    && typeof op.operation_id === "string" && !!op.operation_id
    && Number.isSafeInteger(op.free_units) && op.free_units >= 0 && Number.isSafeInteger(op.paid_units) && op.paid_units >= 0
    && (["reserved", "committed"].includes(op.state) ? op.free_units + op.paid_units === amount : op.state === "denied" && op.free_units === 0 && op.paid_units === 0);
  try {
    let response = await send("/billing/operations", { app_id: host.appId, unit: BILLING_UNIT, units: amount, retry_key: eventId });
    if (!current()) return { kind: "error" };
    if (response.status === 401 || response.status === 403) return { kind: "auth-required" };
    if (response.status < 200 || response.status >= 300 || !valid(response.json?.data)) return { kind: "error" };
    let op = response.json.data;
    if (op.state === "denied") return { kind: "insufficient" };
    if (op.state === "reserved") {
      const original = op;
      response = await send(`/billing/operations/${encodeURIComponent(op.operation_id)}/commit`, {});
      op = response.json?.data;
      if (!current() || response.status < 200 || response.status >= 300 || !valid(op) || op.operation_id !== original.operation_id
        || op.free_units !== original.free_units || op.paid_units !== original.paid_units) return { kind: "error" };
    }
    if (op.state !== "committed") return { kind: "error" };
    // A balance read can fail after a confirmed debit. Keep the receipt authoritative.
    let balance: any;
    try {
      const result = await send(`/billing/entitlements/me?app_id=${encodeURIComponent(host.appId)}`);
      if (result.status === 200 && current()) balance = accountBalance(result.json?.data, host.appId);
    } catch (_) { /* The next refresh recovers the balance. */ }
    if (!current()) return { kind: "error" };
    return { kind: "ok", freeUnits: op.free_units, paidUnits: op.paid_units,
      ...(balance ? { freeRemaining: balance.free_usage.remaining, balance: balance.credits.balance } : {}) };
  } catch (error) { diagnostics.failure("account-credit-client.consume", error); return { kind: "error" }; }
}
