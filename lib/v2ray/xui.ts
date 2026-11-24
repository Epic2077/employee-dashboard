import "server-only";

/**
 * Minimal 3x-ui panel client.
 *
 * Credentials come from the environment (never from the database or the
 * browser):
 *   XUI_BASE_URL      e.g. https://panel.example.com:2053
 *   XUI_USERNAME      panel user
 *   XUI_PASSWORD      panel password
 *   XUI_SUB_BASE_URL  optional public base for subscription links (falls back
 *                     to XUI_BASE_URL, e.g. https://sub.example.com)
 *
 * Endpoints follow the 3x-ui panel API (`/login`, `/panel/api/inbounds/...`).
 * Everything degrades to `configured: false` when the env is missing.
 */

const BASE = (process.env.XUI_BASE_URL ?? "").trim().replace(/\/+$/, "");
const USERNAME = (process.env.XUI_USERNAME ?? "").trim();
const PASSWORD = process.env.XUI_PASSWORD ?? "";
const SUB_BASE = ((process.env.XUI_SUB_BASE_URL ?? BASE) || "")
  .trim()
  .replace(/\/+$/, "");

const SESSION_TTL_MS = 20 * 60 * 1000;

export function isXuiConfigured(): boolean {
  return Boolean(BASE && USERNAME && PASSWORD);
}

export type XuiInbound = {
  id: number;
  remark: string;
  protocol: string;
  port: number;
  enable: boolean;
};

type XuiEnvelope<T> = {
  success: boolean;
  msg?: string;
  obj?: T;
};

let session: { cookie: string; at: number } | null = null;

async function login(): Promise<string> {
  const body = new URLSearchParams({
    username: USERNAME,
    password: PASSWORD,
  });

  const response = await fetch(`${BASE}/login`, {
    method: "POST",
    body,
    headers: { "content-type": "application/x-www-form-urlencoded" },
    cache: "no-store",
    redirect: "manual",
  });

  const setCookie = response.headers.get("set-cookie");
  if (!response.ok && !setCookie) {
    throw new Error("xui_login_failed");
  }
  if (!setCookie) {
    throw new Error("xui_login_failed");
  }

  const cookie = setCookie.split(";")[0];
  session = { cookie, at: Date.now() };
  return cookie;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<XuiEnvelope<T>> {
  if (!isXuiConfigured()) {
    throw new Error("xui_not_configured");
  }

  const cookie =
    session && Date.now() - session.at < SESSION_TTL_MS
      ? session.cookie
      : await login();

  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { cookie, ...(init.headers ?? {}) },
    cache: "no-store",
  });

  const text = await response.text();
  let payload: XuiEnvelope<T>;

  try {
    payload = JSON.parse(text) as XuiEnvelope<T>;
  } catch {
    // Most likely an expired session that returned the login page.
    if (retry) {
      session = null;
      return request<T>(path, init, false);
    }
    throw new Error("xui_bad_response");
  }

  if (
    !payload.success &&
    retry &&
    /login|session|unauthor/i.test(payload.msg ?? "")
  ) {
    session = null;
    return request<T>(path, init, false);
  }

  return payload;
}

export async function listInbounds(): Promise<XuiInbound[]> {
  const result = await request<
    Array<{
      id: number;
      remark: string;
      protocol: string;
      port: number;
      enable: boolean;
    }>
  >("/panel/api/inbounds/list", { method: "GET" });

  if (!result.success) {
    throw new Error(result.msg || "xui_list_failed");
  }

  return (result.obj ?? [])
    .map((inbound) => ({
      id: inbound.id,
      remark: inbound.remark || `#${inbound.id}`,
      protocol: inbound.protocol,
      port: inbound.port,
      enable: Boolean(inbound.enable),
    }))
    .sort((a, b) => a.id - b.id);
}

export type XuiClientPayload = {
  id: string;
  email: string;
  subId: string;
  limitIp?: number;
  totalGB?: number;
  expiryTime?: number;
  enable?: boolean;
  flow?: string;
};

/** Adds the same client (uuid + subId) to one inbound. */
export async function addClient(
  inboundId: number,
  client: XuiClientPayload,
): Promise<void> {
  const body = new URLSearchParams({
    id: String(inboundId),
    settings: JSON.stringify({ clients: [client] }),
  });

  const result = await request(`/panel/api/inbounds/addClient`, {
    method: "POST",
    body,
    headers: { "content-type": "application/x-www-form-urlencoded" },
  });

  if (!result.success) {
    throw new Error(result.msg || "xui_add_client_failed");
  }
}

export async function removeClient(
  inboundId: number,
  clientId: string,
): Promise<void> {
  const result = await request(
    `/panel/api/inbounds/${inboundId}/delClient/${clientId}`,
    { method: "POST" },
  );

  if (!result.success) {
    throw new Error(result.msg || "xui_del_client_failed");
  }
}

export function subscriptionUrl(
  subId: string,
  override?: string | null,
): string {
  const base = (override || SUB_BASE || BASE).trim().replace(/\/+$/, "");
  return `${base}/sub/${subId}`;
}

/**
 * Panel client name: the employee's name, made safe for the panel
 * (whitespace collapsed) with a numeric suffix for extra configs.
 */
export function buildClientName(fullName: string, index: number): string {
  const base =
    fullName
      .trim()
      .replace(/\s+/g, "_")
      .replace(/[^\p{L}\p{N}._-]/gu, "") || "employee";

  return index > 1 ? `${base}-${index}` : base;
}

export function newClientId(): string {
  return crypto.randomUUID();
}

export function newSubId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}
