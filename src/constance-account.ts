import { applySettingsLayout } from "./settings-layout";
import { diagnostics } from "./diagnostics";
import { renderAccountGuidance } from "./account-guidance";
import { Notice, Setting, requestUrl } from "obsidian";

export const CONSTANCE_ACCOUNT_BASE_URL = "https://app.tutivsoft.com";

export interface ConstanceAccountState {
  billingEmail: string;
  billingAccessToken: string;
  billingRefreshToken: string;
  billingTokenExpiresAt: number;
  billingAccountLinked: boolean;
  billingRegistrationPending?: boolean;
}

export interface ConstanceAccountAdapter {
  state: ConstanceAccountState;
  appId: string;
  installationId: string;
  appVersion?: string;
  persist(): Promise<void>;
  syncBalance(): Promise<void>;
  refresh?(): void;
}

export type FreeUsageResult =
  | { kind: "ok"; remaining: number }
  | { kind: "insufficient" }
  | { kind: "auth-required" }
  | { kind: "error" };

export type AccountSpendResult =
  | { kind: "ok"; balance: number }
  | { kind: "insufficient" }
  | { kind: "auth-required" }
  | { kind: "error" };

class ConstanceAccountError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ConstanceAccountError";
    this.status = status;
  }
}

function errorDetail(response: { json?: any; text?: string }, fallback: string): string {
  const payload = response.json?.data || response.json;
  const detail = payload?.detail;
  const code = detail?.code || payload?.code;
  if (code === "invalid_credentials") return "The email or password is incorrect. Use Forgot password? to reset it.";
  if (code === "email_verification_required") return "Email not verified. Click the link in your email, then Connect again.";
  return String(detail?.message || (typeof detail === "string" ? detail : "") || payload?.message || fallback);
}

async function linkAuthenticatedInstallation(adapter: ConstanceAccountAdapter, token: string): Promise<void> {
const diagnosticEnd1 = diagnostics?.start?.("constance-account.linkAuthenticatedInstallation") ?? (() => {});
try {

  try {
    await linkInstallation(adapter, token);
  } catch (error) {
diagnostics.failure("constance-account.caught_1", error);
    if (error instanceof ConstanceAccountError && error.status === 401) {
      adapter.state.billingAccessToken = "";
      adapter.state.billingRefreshToken = "";
      adapter.state.billingAccountLinked = false;
      await adapter.persist();
    }
    throw error;
  }

} catch (diagnosticError1) { diagnostics?.failure?.("constance-account.linkAuthenticatedInstallation", diagnosticError1); throw diagnosticError1; } finally { diagnosticEnd1(); }
}

async function authenticate(
  mode: "login" | "register" | "connect",
  email: string,
  password: string,
  installationId: string,
): Promise<{ accessToken: string; refreshToken: string; expiresAt: number; verificationRequired: boolean }> {
const diagnosticEnd2 = diagnostics?.start?.("constance-account.authenticate") ?? (() => {});
try {

  const body = mode !== "login"
    ? { email, password, external_customer_id: installationId }
    : { email, password };
  const response = await (diagnostics?.request?.("network.constance-account.authenticate", requestUrl, {
    url: `${CONSTANCE_ACCOUNT_BASE_URL}/api/v1/auth/${mode}`,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    throw: false,
  }) ?? requestUrl({
    url: `${CONSTANCE_ACCOUNT_BASE_URL}/api/v1/auth/${mode}`,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    throw: false,
  }));
  if (response.status < 200 || response.status >= 300) {
    throw new ConstanceAccountError(errorDetail(response, `Could not connect your account. Check your connection and try again.`), response.status);
  }
  if (response.json?.verification_required === true) return { accessToken: "", refreshToken: "", expiresAt: 0, verificationRequired: true };
  const accessToken = String(response.json?.access_token || "");
  const refreshToken = String(response.json?.refresh_token || "");
  if (!accessToken || !refreshToken) throw new Error("Could not complete sign-in. Try connecting again.");
  return { accessToken, refreshToken, expiresAt: Date.now() + Number(response.json?.expires_in || 900) * 1000, verificationRequired: false };

} catch (diagnosticError2) { diagnostics?.failure?.("constance-account.authenticate", diagnosticError2); throw diagnosticError2; } finally { diagnosticEnd2(); }
}

export async function clearBillingSession(adapter: ConstanceAccountAdapter, revoke = false): Promise<void> {
const diagnosticEnd3 = diagnostics?.start?.("constance-account.clearBillingSession") ?? (() => {});
try {

  const refreshToken = adapter.state.billingRefreshToken;
  adapter.state.billingAccessToken = "";
  adapter.state.billingRefreshToken = "";
  adapter.state.billingTokenExpiresAt = 0;
  adapter.state.billingAccountLinked = false;
  await adapter.persist();
  if (revoke && refreshToken) {
    try {
      await (diagnostics?.request?.("network.constance-account.clearBillingSession", requestUrl, { url: `${CONSTANCE_ACCOUNT_BASE_URL}/api/v1/auth/logout`, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: refreshToken }), throw: false }) ?? requestUrl({ url: `${CONSTANCE_ACCOUNT_BASE_URL}/api/v1/auth/logout`, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: refreshToken }), throw: false }));
    } catch (error) {
diagnostics.failure("constance-account.caught_extra_1", error); diagnostics?.legacy?.("warn", "constance-account.constance_logout_failed"); }
  }

} catch (diagnosticError3) { diagnostics?.failure?.("constance-account.clearBillingSession", diagnosticError3); throw diagnosticError3; } finally { diagnosticEnd3(); }
}

const billingRefreshes = new WeakMap<ConstanceAccountState, Promise<boolean>>();

export async function refreshBillingSession(state: ConstanceAccountState, persist?: () => Promise<void>): Promise<boolean> {
const diagnosticEnd4 = diagnostics?.start?.("constance-account.refreshBillingSession") ?? (() => {});
try {

  const pending = billingRefreshes.get(state);
  if (pending) { const ok = await pending; if (ok) await persist?.(); return await (ok); }
  const original = state.billingRefreshToken;
  if (!original) return false;
  const operation = (async () => {
const diagnosticEnd5 = diagnostics?.start?.("constance-account.background.4664") ?? (() => {});
try {

    try {
      const response = await (diagnostics?.request?.("network.constance-account.refreshBillingSession", requestUrl, {
        url: `${CONSTANCE_ACCOUNT_BASE_URL}/api/v1/auth/refresh`, method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: original }), throw: false,
      }) ?? requestUrl({
        url: `${CONSTANCE_ACCOUNT_BASE_URL}/api/v1/auth/refresh`, method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: original }), throw: false,
      }));
      if (state.billingRefreshToken !== original) return false;
      if (response.status === 401 || response.status === 403) {
        state.billingAccessToken = ""; state.billingRefreshToken = ""; state.billingAccountLinked = false;
        await persist?.(); return false;
      }
      if (response.status < 200 || response.status >= 300) return false;
      const access = String(response.json?.access_token || "");
      const refresh = String(response.json?.refresh_token || "");
      if (!access || !refresh) return false;
      state.billingAccessToken = access; state.billingRefreshToken = refresh;
      state.billingTokenExpiresAt = Date.now() + (Number(response.json?.expires_in) || 900) * 1000;
      await persist?.(); return true;
    } catch (caughtError2) {
diagnostics.failure("constance-account.caught_3", caughtError2); return false; }

} catch (diagnosticError5) { diagnostics?.failure?.("constance-account.background.4664", diagnosticError5); throw diagnosticError5; } finally { diagnosticEnd5(); }
})();
  billingRefreshes.set(state, operation);
  try { return await operation; } finally { billingRefreshes.delete(state); }

} catch (diagnosticError4) { diagnostics?.failure?.("constance-account.refreshBillingSession", diagnosticError4); throw diagnosticError4; } finally { diagnosticEnd4(); }
}

export async function ensureBillingAccessToken(adapter: ConstanceAccountAdapter, force = false): Promise<string> {
const diagnosticEnd6 = diagnostics?.start?.("constance-account.ensureBillingAccessToken") ?? (() => {});
try {

  const state = adapter.state;
  if (!state.billingAccountLinked) return "";
  if (!force && state.billingAccessToken && state.billingTokenExpiresAt > Date.now() + 30000) return await (state.billingAccessToken);
  return await (await refreshBillingSession(state, adapter.persist) ? state.billingAccessToken : "");

} catch (diagnosticError6) { diagnostics?.failure?.("constance-account.ensureBillingAccessToken", diagnosticError6); throw diagnosticError6; } finally { diagnosticEnd6(); }
}


async function linkInstallation(adapter: ConstanceAccountAdapter, token: string): Promise<void> {
const diagnosticEnd7 = diagnostics?.start?.("constance-account.linkInstallation") ?? (() => {});
try {

  const response = await (diagnostics?.request?.("network.constance-account.linkInstallation", requestUrl, {
    url: `${CONSTANCE_ACCOUNT_BASE_URL}/api/v1/billing/installations/link`,
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      app_id: adapter.appId,
      installation_id: adapter.installationId,
      legacy_external_customer_id: adapter.installationId,
      platform: "obsidian",
      app_version: adapter.appVersion || undefined,
    }),
    throw: false,
  }) ?? requestUrl({
    url: `${CONSTANCE_ACCOUNT_BASE_URL}/api/v1/billing/installations/link`,
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      app_id: adapter.appId,
      installation_id: adapter.installationId,
      legacy_external_customer_id: adapter.installationId,
      platform: "obsidian",
      app_version: adapter.appVersion || undefined,
    }),
    throw: false,
  }));
  if (response.status < 200 || response.status >= 300) {
    throw new ConstanceAccountError(errorDetail(response, `Could not connect this installation to your account. Try connecting again.`), response.status);
  }

} catch (diagnosticError7) { diagnostics?.failure?.("constance-account.linkInstallation", diagnosticError7); throw diagnosticError7; } finally { diagnosticEnd7(); }
}

export async function signInBillingAccount(
  adapter: ConstanceAccountAdapter,
  password: string,
  mode: "login" | "register" | "connect",
): Promise<void> {
const diagnosticEnd8 = diagnostics?.start?.("constance-account.signInBillingAccount") ?? (() => {});
try {

  const email = adapter.state.billingEmail.trim().toLowerCase();
  const journalState = adapter.state as ConstanceAccountState & Record<string, any>;
  const owner = String(journalState.pendingBillingOwnerEmail || "").toLowerCase();
  if (owner && owner !== email) throw new Error(`A pending action belongs to ${owner}. Connect that account to resume it first.`);

  if (!email || !email.includes("@")) throw new Error("Enter a valid email address.");
  if (Array.from(password).length < 8 || Array.from(password).length > 128) throw new Error("Password must be between 8 and 128 characters.");
  if (!adapter.installationId) throw new Error("The plugin is still starting. Try again shortly.");
  const session = await authenticate(mode, email, password, adapter.installationId);
  if (session.verificationRequired) {
    await clearBillingSession(adapter, true);
    adapter.state.billingEmail = email;
    adapter.state.billingRegistrationPending = true;
    await adapter.persist();
    return;
  }
  adapter.state.billingEmail = email;
  adapter.state.billingAccessToken = session.accessToken;
  adapter.state.billingRefreshToken = session.refreshToken;
  adapter.state.billingTokenExpiresAt = session.expiresAt;
  adapter.state.billingAccountLinked = false;
  adapter.state.billingRegistrationPending = false;
  await adapter.persist();
  await linkAuthenticatedInstallation(adapter, session.accessToken);
  adapter.state.billingAccountLinked = true;
  await adapter.persist();
  await adapter.syncBalance();

} catch (diagnosticError8) { diagnostics?.failure?.("constance-account.signInBillingAccount", diagnosticError8); throw diagnosticError8; } finally { diagnosticEnd8(); }
}

export async function validateBillingSession(adapter: ConstanceAccountAdapter): Promise<boolean> {
const diagnosticEnd9 = diagnostics?.start?.("constance-account.validateBillingSession") ?? (() => {});
try {

  const token = await ensureBillingAccessToken(adapter);
  if (!token || !adapter.state.billingAccountLinked || !adapter.installationId) return false;
  const query = new URLSearchParams({ app_id: adapter.appId, installation_id: adapter.installationId });
  const response = await (diagnostics?.request?.("network.constance-account.validateBillingSession", requestUrl, {
    url: `${CONSTANCE_ACCOUNT_BASE_URL}/api/v1/billing/entitlements/me?${query.toString()}`,
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    throw: false,
  }) ?? requestUrl({
    url: `${CONSTANCE_ACCOUNT_BASE_URL}/api/v1/billing/entitlements/me?${query.toString()}`,
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    throw: false,
  }));
  if (response.status === 401 || response.status === 403 || response.status === 404) {
    if (adapter.state.billingRefreshToken) return false;
    await clearBillingSession(adapter);
    return false;
  }
  return await (response.status >= 200 && response.status < 300);

} catch (diagnosticError9) { diagnostics?.failure?.("constance-account.validateBillingSession", diagnosticError9); throw diagnosticError9; } finally { diagnosticEnd9(); }
}

export async function claimAccountFreeUsage(
  adapter: ConstanceAccountAdapter,
  appId: string,
  installationId: string,
  eventId: string,
  amount: number,
): Promise<FreeUsageResult> {
const diagnosticEnd10 = diagnostics?.start?.("constance-account.claimAccountFreeUsage") ?? (() => {});
try {

  const token = await ensureBillingAccessToken(adapter);
  if (!token) return { kind: adapter.state.billingRefreshToken ? "error" : "auth-required" };
  try {
    const response = await (diagnostics?.request?.("network.constance-account.claimAccountFreeUsage", requestUrl, {
      url: `${CONSTANCE_ACCOUNT_BASE_URL}/api/v1/billing/free-usage/claim`,
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ app_id: appId, installation_id: installationId, event_id: eventId, amount }),
      throw: false,
    }) ?? requestUrl({
      url: `${CONSTANCE_ACCOUNT_BASE_URL}/api/v1/billing/free-usage/claim`,
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ app_id: appId, installation_id: installationId, event_id: eventId, amount }),
      throw: false,
    }));
    if (response.status === 402) return { kind: "insufficient" };
    if ((response.status === 401 || response.status === 403) && adapter.state.billingRefreshToken) return { kind: "error" };
    if (response.status === 401 || response.status === 403 || response.status === 404) return { kind: "auth-required" };
    if (response.status < 200 || response.status >= 300) return { kind: "error" };
    const remaining = Math.max(0, Number(response.json?.data?.remaining) || 0);
    new Notice(`Credit balance before this task: ${(remaining + amount).toLocaleString()} free credits.`);
    new Notice(`Task used ${amount.toLocaleString()} credits. Balance remaining: ${remaining.toLocaleString()} free credits.`);
    return { kind: "ok", remaining };
  } catch (error) {
diagnostics.failure("constance-account.caught_extra_2", error);
    diagnostics?.legacy?.("error", "constance-account.constance_account_free_usage_claim_failed");
    return { kind: "error" };
  }

} catch (diagnosticError10) { diagnostics?.failure?.("constance-account.claimAccountFreeUsage", diagnosticError10); throw diagnosticError10; } finally { diagnosticEnd10(); }
}

/** Spend paid credits only after Constance verifies the signed-in account owns this installation. */
export async function spendAccountCredits(
  adapter: ConstanceAccountAdapter,
  appId: string,
  installationId: string,
  eventId: string,
  amount: number,
): Promise<AccountSpendResult> {
const diagnosticEnd11 = diagnostics?.start?.("constance-account.spendAccountCredits") ?? (() => {});
try {

  const token = await ensureBillingAccessToken(adapter);
  if (!token) return { kind: adapter.state.billingRefreshToken ? "error" : "auth-required" };
  try {
    const response = await (diagnostics?.request?.("network.constance-account.spendAccountCredits", requestUrl, {
      url: `${CONSTANCE_ACCOUNT_BASE_URL}/api/v1/billing/credits/spend`,
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ app_id: appId, installation_id: installationId, event_id: eventId, amount }),
      throw: false,
    }) ?? requestUrl({
      url: `${CONSTANCE_ACCOUNT_BASE_URL}/api/v1/billing/credits/spend`,
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ app_id: appId, installation_id: installationId, event_id: eventId, amount }),
      throw: false,
    }));
    if (response.status === 402) return { kind: "insufficient" };
    if ((response.status === 401 || response.status === 403) && adapter.state.billingRefreshToken) return { kind: "error" };
    if (response.status === 401 || response.status === 403 || response.status === 404) return { kind: "auth-required" };
    if (response.status < 200 || response.status >= 300) return { kind: "error" };
    const balance = Number(response.json?.data?.credits?.balance);
    if (!Number.isFinite(balance)) return { kind: "error" };
    const remaining = Math.max(0, balance);
    new Notice(`Credit balance before this task: ${(remaining + amount).toLocaleString()} purchased credits.`);
    new Notice(`Task used ${amount.toLocaleString()} credits. Balance remaining: ${remaining.toLocaleString()} purchased credits.`);
    return { kind: "ok", balance: remaining };
  } catch (error) {
diagnostics.failure("constance-account.caught_extra_3", error);
    diagnostics?.legacy?.("error", "constance-account.constance_authenticated_credit_spend_failed");
    return { kind: "error" };
  }

} catch (diagnosticError11) { diagnostics?.failure?.("constance-account.spendAccountCredits", diagnosticError11); throw diagnosticError11; } finally { diagnosticEnd11(); }
}

export function addBillingAccountSettings(containerEl: HTMLElement, adapter: ConstanceAccountAdapter): void {
  let password = "";
  const section = containerEl.createDiv({ cls: "constance-account-billing-section" });

  renderAccountGuidance(section, { appId: adapter.appId, connected: adapter.state.billingAccountLinked && Boolean(adapter.state.billingAccessToken || adapter.state.billingRefreshToken), defaultAllowance: 10000, unit: "characters", workflow: "Select text or open a Markdown note, then choose a Torbert transformation. You can undo the changes." });
  section.createEl("h3", { text: "Account and billing" });
  const state = adapter.state as ConstanceAccountState & Record<string, unknown>;
  const numericBalances = Object.entries(state)
    .filter(([key, value]) => /(?:credit|balance|remaining)/i.test(key) && typeof value === "number")
    .map(([key, value]) => `${key.replace(/^cached/i, "").replace(/^free/i, "Free ").replace(/^purchased/i, "Purchased ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").trim().toLowerCase()}: ${Number(value).toLocaleString()}`);
  const accountStatus = adapter.state.billingAccountLinked
    ? `Signed in as ${adapter.state.billingEmail || "your account"}`
    : state.billingRegistrationPending
      ? `Registered as ${adapter.state.billingEmail} but not signed in. Check your email, click the confirmation link, then sign in here.`
      : "Not signed in.";
  section.createEl("p", {
    cls: "constance-account-status",
    text: numericBalances.length ? `${accountStatus} Balance — ${numericBalances.join("; ")}` : accountStatus,
  });

  if (!adapter.state.billingAccountLinked) {
  new Setting(section)
    .setName("Email")
    .setDesc(adapter.state.billingAccountLinked ? "Sign out before changing accounts." : "Use the email associated with your account and purchases.")
    .addText((text) => text.setPlaceholder("you@example.com").setValue(adapter.state.billingEmail).setDisabled(adapter.state.billingAccountLinked).onChange(async (value) => {
return diagnostics.guard("constance-account.control_4", async () => {
const diagnosticEnd12 = diagnostics?.start?.("control.email.onChange") ?? (() => {});
try {

      if (adapter.state.billingAccountLinked) return;
      const journalState = adapter.state as ConstanceAccountState & Record<string, any>;
      const hasPending = Object.entries(journalState).some(([key, value]) => /^pending/i.test(key) && key !== "pendingBillingOwnerEmail" && !!value && (Array.isArray(value) ? value.length > 0 : typeof value === "object" ? Object.keys(value).length > 0 : true));
      if (hasPending && !journalState.pendingBillingOwnerEmail) journalState.pendingBillingOwnerEmail = adapter.state.billingEmail;
      if (!hasPending) journalState.pendingBillingOwnerEmail = undefined;
      adapter.state.billingEmail = value.trim();
      await adapter.persist();

} catch (diagnosticError12) { diagnostics?.failure?.("control.email.onChange", diagnosticError12); throw diagnosticError12; } finally { diagnosticEnd12(); }

});
}));
  new Setting(section)
    .setName("Password")
    .setDesc("Your password is used to sign in and is not saved by the plugin.")
    .addText((text) => {
      text.inputEl.type = "password";
      text.inputEl.maxLength = 256;
      text.setPlaceholder("8 to 128 characters").onChange((value) => {
return diagnostics.guard("constance-account.control_5", () => {
const diagnosticAction13 = () => {
 password = value;
}; return diagnostics?.run ? diagnostics.run("control.16002.onChange", diagnosticAction13) : diagnosticAction13();

});
});
    });
  }
  new Setting(section)
    .setName("Account")
    .setDesc(accountStatus)
    .addButton((button) => { if (adapter.state.billingAccountLinked) { button.buttonEl.remove(); return; } button.setButtonText("Connect").setDisabled(adapter.state.billingAccountLinked).onClick(async () => {
return diagnostics.guard("constance-account.control_6", async () => {
const diagnosticEnd14 = diagnostics?.start?.("control.connect.onClick") ?? (() => {});
try {

      button.setDisabled(true);
      try {
        await signInBillingAccount(adapter, password, "connect");
        password = "";
        new Notice(adapter.state.billingRegistrationPending ? "Check your email and follow the verification link, then Connect again." : `Connected as ${adapter.state.billingEmail}.`);
        adapter.refresh?.();
      } catch (error) {
diagnostics.failure("constance-account.caught_7", error);
        new Notice(error instanceof Error ? error.message : "Connection failed. Please try again.");
        adapter.refresh?.();
      } finally { button.setDisabled(adapter.state.billingAccountLinked); }

} catch (diagnosticError14) { diagnostics?.failure?.("control.connect.onClick", diagnosticError14); throw diagnosticError14; } finally { diagnosticEnd14(); }

});
}); })
    .addButton((button) => button.setButtonText("Sign out").setDisabled(!adapter.state.billingAccessToken && !adapter.state.billingRefreshToken).onClick(async () => {
return diagnostics.guard("constance-account.control_8", async () => {
const diagnosticEnd15 = diagnostics?.start?.("control.account.onClick") ?? (() => {});
try {

      await clearBillingSession(adapter, true);
      state.billingRegistrationPending = false;
      new Notice("Signed out.");
      adapter.refresh?.();

} catch (diagnosticError15) { diagnostics?.failure?.("control.account.onClick", diagnosticError15); throw diagnosticError15; } finally { diagnosticEnd15(); }

});
}));

  if (!adapter.state.billingAccountLinked) new Setting(section).setName("Forgot password?").setDesc("Reset your account password in your browser.").addButton((button) => button.setButtonText("Open reset page").onClick(() => {
return diagnostics.guard("constance-account.control_9", () => { const diagnosticAction16 = () => (window.open(`${CONSTANCE_ACCOUNT_BASE_URL}/password-reset`, "_blank")); return diagnostics?.run ? diagnostics.run("control.forgot_password_.onClick", diagnosticAction16) : diagnosticAction16();
});
}));

  const firstHeading = containerEl.querySelector(":scope > h1, :scope > h2");
  if (firstHeading?.nextSibling) containerEl.insertBefore(section, firstHeading.nextSibling);
  else containerEl.prepend(section);
  queueMicrotask(() => {
    const candidates = Array.from(containerEl.querySelectorAll(":scope > .setting-item"));
    for (const item of candidates) {
      const label = item.textContent || "";
      if (/buy|checkout|refresh balance|sync balance|credit pack/i.test(label)) section.appendChild(item);
    }
    for (const summary of Array.from(containerEl.querySelectorAll('[class*="credit"][class*="summary"], [class*="balance"][class*="summary"]'))) {
      if (!section.contains(summary)) section.appendChild(summary);
    }
  });
  queueMicrotask(() => applySettingsLayout(containerEl, adapter.appId));
}


/** A single welcome with an actionable setup link; account guidance stays in settings until connected. */
export async function showAccountWelcome(plugin: import("obsidian").Plugin, state: ConstanceAccountState, persist: () => Promise<void>): Promise<void> {
const diagnosticEnd17 = diagnostics?.start?.("constance-account.showAccountWelcome") ?? (() => {});
try {

  const openSetup = (): void => {
    const settings = (plugin.app as unknown as { setting: { open(): void; openTabById(id: string): void } }).setting;
    settings.open(); settings.openTabById(plugin.manifest.id);
  };
  plugin.addCommand({ id: "open-account-setup", name: "Get started: connect your account", callback: openSetup });
  // PluginSupport owns the single first-use welcome and persists through the host.

} catch (diagnosticError17) { diagnostics?.failure?.("constance-account.showAccountWelcome", diagnosticError17); throw diagnosticError17; } finally { diagnosticEnd17(); }
}
