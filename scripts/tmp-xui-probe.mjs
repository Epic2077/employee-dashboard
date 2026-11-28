import crypto from "node:crypto";

const RAW = (process.env.XUI_BASE_URL ?? "").replace(/\/+$/, "");
const USERNAME = process.env.XUI_USERNAME ?? "";
const PASSWORD = process.env.XUI_PASSWORD ?? "";
const out = (...args) => console.log(...args);

async function resolveBase() {
  const probe = await fetch(`${RAW}/`, { redirect: "manual" });
  const location = probe.headers.get("location");
  if ([301, 302, 307, 308].includes(probe.status) && location) {
    const target = new URL(location, `${RAW}/`);
    return `${target.origin}${target.pathname.replace(/\/+$/, "")}`;
  }
  return RAW;
}

async function main() {
  const base = await resolveBase();
  out("base ok", base !== RAW);

  const root = await fetch(`${base}/`, { redirect: "follow" });
  const cookie = (root.headers.get("set-cookie") ?? "").split(";")[0];
  const csrfRes = await fetch(`${base}/csrf-token`, {
    headers: { cookie, "X-Requested-With": "XMLHttpRequest" },
  });
  const token = JSON.parse(await csrfRes.text()).obj;

  const loginRes = await fetch(`${base}/login`, {
    method: "POST",
    headers: {
      cookie,
      "content-type": "application/x-www-form-urlencoded",
      "X-CSRF-Token": token,
      "X-Requested-With": "XMLHttpRequest",
    },
    body: new URLSearchParams({ username: USERNAME, password: PASSWORD }),
    redirect: "manual",
  });
  out("login", loginRes.status);
  const session =
    (loginRes.headers.get("set-cookie") ?? "").split(";")[0] || cookie;

  const headers = {
    cookie: session,
    "X-CSRF-Token": token,
    "X-Requested-With": "XMLHttpRequest",
    "content-type": "application/json",
  };

  const settingsRes = await fetch(`${base}/panel/api/setting/all`, {
    method: "POST",
    headers,
    body: "{}",
  });
  const settings = JSON.parse(await settingsRes.text()).obj ?? {};

  const host = new URL(RAW).hostname;
  const subDomain = String(settings.subDomain ?? "").trim() || host;
  const subPort = settings.subPort ? `:${settings.subPort}` : "";
  const subPath = String(settings.subPath ?? "");
  const subURI = String(settings.subURI ?? "").trim();
  out("sub config", {
    enable: settings.subEnable,
    port: settings.subPort,
    hasDomain: Boolean(String(settings.subDomain ?? "").trim()),
    pathHasToken: subPath.includes((process.env.XUI_SUB_BASE_URL ?? "").trim()),
    uriSet: Boolean(subURI),
  });

  const email = `__ztest_${crypto.randomBytes(3).toString("hex")}__`;
  await fetch(`${base}/panel/api/clients/add`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      client: {
        email,
        totalGB: 0,
        expiryTime: 0,
        limitIp: 0,
        limitHwid: 0,
        tgId: 0,
        enable: true,
      },
      inboundIds: [1, 2],
    }),
  });

  const getBody = JSON.parse(
    await (
      await fetch(
        `${base}/panel/api/clients/get/${encodeURIComponent(email)}`,
        {
          headers: { cookie: session },
        },
      )
    ).text(),
  );
  const subId = getBody?.obj?.client?.subId ?? "";
  out(
    "client created",
    Boolean(subId),
    "inbounds",
    (getBody?.obj?.inboundIds ?? []).join(","),
  );

  const normalizedPath = subPath.replace(/^\/+|\/+$/g, "");
  const subOrigin = `${subURI ? subURI.replace(/\/+$/, "") : `https://${subDomain}${subPort}`}`;
  const candidates = [
    `${subOrigin}/${normalizedPath}/${subId}`,
    `${subOrigin}/${normalizedPath}${subId}`,
    `${subOrigin}/sub/${subId}`,
    `${subOrigin}/${subId}`,
  ];

  for (const url of candidates) {
    const response = await fetch(url);
    const text = await response.text();
    out(
      "sub",
      response.status,
      "len",
      text.length,
      url
        .replace(subOrigin, "<subOrigin>")
        .replace(subId, "<subId>")
        .replace(normalizedPath, "<subPath>"),
    );
  }

  const delRes = await fetch(
    `${base}/panel/api/clients/del/${encodeURIComponent(email)}`,
    { method: "POST", headers },
  );
  out("del", delRes.status);
}

main().catch((error) => out("fatal", error?.message ?? error));
