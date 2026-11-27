import "server-only";

/**
 * Minimal 3x-ui panel client.
 *
 * Credentials come from the environment (never from the database or the
 * browser):
 *   XUI_BASE_URL      e.g. https://panel.example.com:2053
 *   XUI_USERNAME      panel user
 *   XUI_PASSWORD      panel password
 *   XUI_SUB_BASE_URL  optional public base for subscription links, including
 *                     the panel's sub path token (falls back to XUI_BASE_URL),
 *                     e.g. https://sub.example.com:2096/abcd1234 — the final
 *                     link is <base>/<subId> (no /sub/ segment)
 *
 * Endpoints follow the 3x-ui panel API (`/login`, `/panel/api/inbounds/...`).
 * Everything degrades to `configured: false` when the env is missing.
 */

const BASE = (process.env.XUI_BASE_URL ?? "").trim().replace(/\/+$/, "");
const USERNAME = (process.env.XUI_USERNAME ?? "").trim();
const PASSWORD = process.env.XUI_PASSWORD ?? "";
const SUB_BASE_RAW = (process.env.XUI_SUB_BASE_URL ?? "")
  .trim()
  .replace(/\/+$/, "");
// A bare host/path is not a usable subscription base: fall back to the panel.
const SUB_BASE = /^https?:\/\//i.test(SUB_BASE_RAW)
  ? SUB_BASE_RAW
  : BASE || SUB_BASE_RAW;

const SESSION_TTL_MS = 20 * 60 * 1000;

/**
 * The panel's login endpoint. 3x-ui serves POST /login; override with
 * XUI_LOGIN_PATH when a reverse proxy maps it elsewhere.
 */
const LOGIN_PATH = (() => {
  const custom = (process.env.XUI_LOGIN_PATH ?? "").trim() || "/login";
  return custom.startsWith("/") ? custom : `/${custom}`;
})();

/**
 * Debug logging.
 *
 * Enabled automatically outside production, or anywhere with XUI_DEBUG=1.
 * The password is masked; set XUI_DEBUG_SECRETS=1 to print it verbatim when
 * you need to confirm the exact value the server received.
 */
const DEBUG =
  process.env.NODE_ENV !== "production" ||
  /^(1|true|yes|on)$/i.test(process.env.XUI_DEBUG ?? "");
const DEBUG_SECRETS = /^(1|true|yes|on)$/i.test(
  process.env.XUI_DEBUG_SECRETS ?? "",
);

function maskSecret(value: string): string {
  if (!value) return "<empty>";
  if (DEBUG_SECRETS) return value;
  const hint =
    value.length > 4
      ? `${value.slice(0, 2)}***${value.slice(-2)}`
      : `${value[0]}***`;
  return `${hint} (len=${value.length}, set XUI_DEBUG_SECRETS=1 to print)`;
}

function snippet(value: string, max = 240): string {
  const flat = value.replace(/\s+/g, " ").trim();
  if (!flat) return "<empty body>";
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

function logXui(event: string, details: Record<string, unknown> = {}): void {
  if (!DEBUG) return;
  console.log(`[xui] ${event}`, details);
}

/**
 * Panels behind nginx/Cloudflare often reject non-browser clients with an
 * empty 403, so every call mimics a real browser.
 */
function browserHeaders(
  extra: Record<string, string> = {},
): Record<string, string> {
  let origin: string | undefined;
  try {
    origin = new URL(BASE).origin;
  } catch {
    origin = undefined;
  }

  return {
    accept: "application/json, text/plain, */*",
    "accept-language": "en-US,en;q=0.9,fa;q=0.8",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    ...(origin ? { origin, referer: `${BASE}/` } : {}),
    ...extra,
  };
}

logXui("config", {
  rawBaseUrl: process.env.XUI_BASE_URL ?? "<unset>",
  baseUrl: BASE || "<empty>",
  subBaseUrl: SUB_BASE || "<empty>",
  loginUrl: `${BASE}${LOGIN_PATH}`,
  username: USERNAME || "<empty>",
  password: maskSecret(PASSWORD),
  configured: isXuiConfigured(),
});

if (SUB_BASE_RAW && !/^https?:\/\//i.test(SUB_BASE_RAW)) {
  console.warn(
    `[xui] XUI_SUB_BASE_URL="${SUB_BASE_RAW}" is not an absolute URL; falling back to ${BASE}. Use the full sub base including the sub path token, e.g. https://sub.example.com:2096/abcd1234`,
  );
}

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

/** A non-JSON (usually error) response from the panel. */
export class XuiHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "XuiHttpError";
  }
}

/** Cookie jar shared by every panel call (3x-ui sets csrf + session cookies). */
const cookieJar = new Map<string, string>();
let sessionAt: number | null = null;
let csrfTokenCache: string | null = null;

function setCookieList(headers: Headers): string[] {
  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] })
    .getSetCookie;
  if (typeof getSetCookie === "function") {
    return getSetCookie.call(headers);
  }
  const single = headers.get("set-cookie");
  return single ? [single] : [];
}

/** Stores response cookies and returns how many were received. */
function storeCookies(headers: Headers): number {
  const list = setCookieList(headers);
  for (const raw of list) {
    const pair = raw.split(";")[0];
    const eq = pair.indexOf("=");
    if (eq > 0) {
      cookieJar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }
  if (list.length) {
    logXui("cookies:stored", { names: [...cookieJar.keys()] });
  }
  return list.length;
}

function cookieHeader(): string {
  return [...cookieJar.entries()]
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

/**
 * The React-based panel protects state-changing calls with a CSRF token that
 * is embedded in the login page (`<meta name="csrf-token">`) and tied to a
 * cookie set by that same GET. Older Go-template panels have no meta token.
 */
async function fetchCsrfToken(): Promise<string | null> {
  const url = `${BASE}/`;
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: browserHeaders({
        accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      }),
      cache: "no-store",
    });

    storeCookies(response.headers);
    const html = await response.text();
    const match =
      /<meta[^>]*name=["']csrf-token["'][^>]*content=["']([^"']+)["']/i.exec(
        html,
      ) ??
      /<meta[^>]*content=["']([^"']+)["'][^>]*name=["']csrf-token["']/i.exec(
        html,
      );

    logXui("csrf:token", {
      url,
      status: response.status,
      tokenFound: Boolean(match?.[1]),
      body: snippet(html, 120),
    });

    csrfTokenCache = match?.[1] ?? null;
    return csrfTokenCache;
  } catch (error) {
    logXui("csrf:failed", {
      url,
      error: error instanceof Error ? error.message : error,
    });
    csrfTokenCache = null;
    return null;
  }
}

async function login(): Promise<void> {
  const csrfToken = await fetchCsrfToken();
  const url = `${BASE}${LOGIN_PATH}`;
  const cookie = cookieHeader();

  logXui("login:request", {
    url,
    username: USERNAME || "<empty>",
    password: maskSecret(PASSWORD),
    csrfToken: csrfToken ? "<found>" : "<none>",
    cookies: cookie ? "<sent>" : "<none>",
  });

  const response = await fetch(url, {
    method: "POST",
    body: new URLSearchParams({ username: USERNAME, password: PASSWORD }),
    headers: browserHeaders({
      "content-type": "application/x-www-form-urlencoded",
      ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
      ...(cookie ? { cookie } : {}),
    }),
    cache: "no-store",
    redirect: "manual",
  });

  const receivedCookies = storeCookies(response.headers);
  const location = response.headers.get("location");
  const rawBody = await response.text();

  let payload: XuiEnvelope<unknown> | null = null;
  try {
    payload = JSON.parse(rawBody) as XuiEnvelope<unknown>;
  } catch {
    payload = null;
  }

  logXui("login:response", {
    url,
    status: response.status,
    location: location ?? "<none>",
    receivedCookies,
    success: payload?.success,
    msg: payload?.msg,
    body: snippet(rawBody),
  });

  const succeeded = payload?.success === true || receivedCookies > 0;
  if (!succeeded) {
    const reason =
      payload?.msg ??
      (csrfToken
        ? "no session cookie returned"
        : `no CSRF token on ${BASE}/ and no session cookie (check XUI_BASE_URL points at the panel root)`);
    throw new Error(
      `xui_login_failed: POST ${url} → HTTP ${response.status}, ${reason}, body=${JSON.stringify(snippet(rawBody, 160))}`,
    );
  }

  sessionAt = Date.now();
  logXui("login:session-created", {
    url,
    cookieNames: [...cookieJar.keys()],
  });
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<XuiEnvelope<T>> {
  if (!isXuiConfigured()) {
    logXui("not-configured", {
      baseUrl: BASE || "<empty>",
      usernameSet: Boolean(USERNAME),
      passwordSet: Boolean(PASSWORD),
      requestPath: path,
    });
    throw new Error("xui_not_configured");
  }

  if (sessionAt === null || Date.now() - sessionAt >= SESSION_TTL_MS) {
    await login();
  }

  const url = `${BASE}${path}`;
  const cookie = cookieHeader();
  logXui("request", {
    method: init.method ?? "GET",
    url,
    retry,
    body:
      typeof init.body === "string"
        ? snippet(init.body)
        : init.body instanceof URLSearchParams
          ? snippet(init.body.toString())
          : init.body
            ? "<binary body>"
            : undefined,
  });

  const response = await fetch(url, {
    ...init,
    headers: {
      ...browserHeaders(),
      ...(cookie ? { cookie } : {}),
      ...(csrfTokenCache ? { "x-csrf-token": csrfTokenCache } : {}),
      ...((init.headers as Record<string, string> | undefined) ?? {}),
    },
    cache: "no-store",
  });

  storeCookies(response.headers);
  const text = await response.text();
  logXui("response", {
    url,
    status: response.status,
    ok: response.ok,
    body: snippet(text),
  });

  let payload: XuiEnvelope<T>;

  try {
    payload = JSON.parse(text) as XuiEnvelope<T>;
  } catch {
    // Most likely an expired session that returned the login page.
    if (retry) {
      logXui("retry:non-json-response", { url, body: snippet(text) });
      cookieJar.clear();
      csrfTokenCache = null;
      sessionAt = null;
      return request<T>(path, init, false);
    }
    throw new XuiHttpError(
      response.status,
      `xui_bad_response: GET/POST ${url} → HTTP ${response.status}, body=${JSON.stringify(snippet(text, 160))}`,
    );
  }

  if (!payload.success) {
    logXui("payload:not-success", {
      url,
      msg: payload.msg ?? "<none>",
      obj: payload.obj === undefined ? "<none>" : payload.obj,
    });
  }

  if (
    !payload.success &&
    retry &&
    /login|session|unauthor/i.test(payload.msg ?? "")
  ) {
    logXui("retry:session-expired", { url, msg: payload.msg });
    cookieJar.clear();
    csrfTokenCache = null;
    sessionAt = null;
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
    throw new Error(
      `xui_list_failed: ${result.msg || "no message"} (GET ${BASE}/panel/api/inbounds/list)`,
    );
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

/**
 * Adds one client (uuid + subId) to the given inbounds.
 *
 * The current 3x-ui panel exposes a single-client API
 * (`POST /panel/api/clients/add` with `{ client, inboundIds }`). Panels that
 * still run the old API answer 404 there, so we fall back to the legacy
 * per-inbound endpoint.
 */
export async function addClient(
  inboundIds: number | number[],
  client: XuiClientPayload,
): Promise<void> {
  const ids = Array.isArray(inboundIds) ? inboundIds : [inboundIds];

  try {
    const result = await request<unknown>("/panel/api/clients/add", {
      method: "POST",
      body: JSON.stringify({ client, inboundIds: ids }),
      headers: { "content-type": "application/json" },
    });

    if (!result.success) {
      throw new Error(
        `xui_add_client_failed: ${result.msg || "no message"} (POST ${BASE}/panel/api/clients/add, inboundIds=${ids.join(",")}, email=${client.email})`,
      );
    }
    return;
  } catch (error) {
    if (!(error instanceof XuiHttpError && error.status === 404)) {
      throw error;
    }
    logXui("add-client:legacy-api", { inboundIds: ids });
  }

  const added: number[] = [];
  for (const inboundId of ids) {
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
      // Roll back what this call already attached.
      for (const rollbackId of added) {
        try {
          await removeClient(rollbackId, client.id);
        } catch {
          // best effort
        }
      }
      throw new Error(
        `xui_add_client_failed: ${result.msg || "no message"} (POST ${BASE}/panel/api/inbounds/addClient, inbound=${inboundId}, email=${client.email})`,
      );
    }
    added.push(inboundId);
  }
}

/** Legacy panel call: removes one client from one inbound by uuid. */
export async function removeClient(
  inboundId: number,
  clientId: string,
): Promise<void> {
  const result = await request(
    `/panel/api/inbounds/${inboundId}/delClient/${clientId}`,
    { method: "POST" },
  );

  if (!result.success) {
    throw new Error(
      `xui_del_client_failed: ${result.msg || "no message"} (POST ${BASE}/panel/api/inbounds/${inboundId}/delClient/${clientId})`,
    );
  }
}

/**
 * Removes a client from every inbound it is attached to. Uses the current
 * panel API (`POST /panel/api/clients/del/{email}`) and falls back to the
 * legacy per-inbound endpoint when the panel does not know it.
 */
export async function removeClientByEmail(
  email: string,
  fallback?: { clientId: string; inboundIds: number[] },
): Promise<void> {
  try {
    const result = await request(
      `/panel/api/clients/del/${encodeURIComponent(email)}`,
      { method: "POST" },
    );

    if (!result.success) {
      throw new Error(
        `xui_del_client_failed: ${result.msg || "no message"} (POST ${BASE}/panel/api/clients/del/${email})`,
      );
    }
    return;
  } catch (error) {
    if (!(error instanceof XuiHttpError && error.status === 404) || !fallback) {
      throw error;
    }
    logXui("del-client:legacy-api", { email, inboundIds: fallback.inboundIds });
  }

  for (const inboundId of fallback.inboundIds) {
    await removeClient(inboundId, fallback.clientId);
  }
}

export function subscriptionUrl(
  subId: string,
  override?: string | null,
): string {
  const base = (override || SUB_BASE || BASE).trim().replace(/\/+$/, "");
  const url = `${base}/${subId}`;
  logXui("subscription-url", {
    base,
    source: override ? "config override" : "XUI_SUB_BASE_URL/XUI_BASE_URL",
    url,
  });
  return url;
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
