const fs = require("fs");
const path = require("path");

const OUT_PATH = path.join(__dirname, "confd", "02-outbounds.json");

const SELECTOR_TAG = "proxy";
const SELECTOR_TYPE = "urltest";
const SELECTOR_INTERRUPT_EXIST_CONNECTIONS = false;
const TEST_URL = "https://www.gstatic.com/generate_204";

async function getRawText(source) {
  if (/^https?:\/\//i.test(source)) {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`fetch failed: ${res.status} ${res.statusText}`);
    return await res.text();
  }
  return fs.readFileSync(source, "utf-8");
}

function looksBase64(s) {
  return /^[A-Za-z0-9+/=\s]+$/.test(s) && !s.includes("vless://");
}

function extractLines(raw) {
  let text = raw.trim();
  if (looksBase64(text)) {
    try {
      text = Buffer.from(text, "base64").toString("utf-8");
    } catch {}
  }
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith("vless://"));
}

function slugify(input, fallback) {
  const decoded = (() => {
    try {
      return decodeURIComponent(input || "");
    } catch {
      return input || "";
    }
  })();
  const slug = decoded
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase()
    .slice(0, 40);
  return slug || fallback;
}

function uniqueTag(base, used) {
  let tag = base;
  let i = 2;
  while (used.has(tag)) {
    tag = `${base}-${i++}`;
  }
  used.add(tag);
  return tag;
}

function parseVlessUri(uri, used) {
  const url = new URL(uri);
  const uuid = decodeURIComponent(url.username);
  const host = url.hostname;
  const port = Number(url.port);
  const q = url.searchParams;

  const security = q.get("security") || "none";
  const network = q.get("type") || "tcp";
  const flow = q.get("flow") || undefined;
  const fp = q.get("fp");
  const sni = q.get("sni");
  const pbk = q.get("pbk");
  const sid = q.get("sid");
  const alpn = q.get("alpn");
  const insecure = q.get("allowInsecure") === "1" || q.get("insecure") === "1";

  const fallbackName = `${host}-${port}`;
  const tag = uniqueTag(slugify(url.hash.slice(1), fallbackName), used);

  const outbound = {
    type: "vless",
    tag,
    server: host,
    server_port: port,
    uuid,
    packet_encoding: "xudp",
  };

  if (flow) outbound.flow = flow;

  if (security === "tls" || security === "reality") {
    outbound.tls = { enabled: true };
    if (sni) outbound.tls.server_name = sni;
    if (alpn) outbound.tls.alpn = alpn.split(",");
    if (insecure) outbound.tls.insecure = true;
    if (fp) {
      outbound.tls.utls = { enabled: true, fingerprint: fp };
    }
    if (security === "reality") {
      outbound.tls.reality = { enabled: true };
      if (pbk) outbound.tls.reality.public_key = pbk;
      if (sid) outbound.tls.reality.short_id = sid;
    }
  }

  if (network === "ws") {
    const wsPath = q.get("path") || "/";
    const wsHost = q.get("host");
    outbound.transport = {
      type: "ws",
      path: wsPath,
      ...(wsHost ? { headers: { Host: wsHost } } : {}),
    };
  } else if (network === "grpc") {
    const serviceName = q.get("serviceName") || "";
    outbound.transport = { type: "grpc", service_name: serviceName };
  }

  return outbound;
}

async function main() {
  const [, , source] = process.argv;
  if (!source) {
    console.error("Usage: node get-outbounds.js <subscription-url-or-file>");
    process.exit(1);
  }

  const raw = await getRawText(source);
  const lines = extractLines(raw);

  if (lines.length === 0) {
    console.error("No vless:// entries found in source.");
    process.exit(1);
  }

  const used = new Set();
  const servers = lines
    .map((uri) => {
      try {
        return parseVlessUri(uri, used);
      } catch (err) {
        console.error(`Skipping malformed URI: ${uri}\n  ${err.message}`);
        return null;
      }
    })
    .filter(Boolean);

  const selector = {
    type: SELECTOR_TYPE,
    tag: SELECTOR_TAG,
    interrupt_exist_connections: SELECTOR_INTERRUPT_EXIST_CONNECTIONS,
    outbounds: servers.map((s) => s.tag),
    ...(SELECTOR_TYPE === "urltest" ? { url: TEST_URL, interval: "3m", tolerance: 50 } : { default: servers[0].tag }),
  };

  const config = {
    outbounds: [selector, ...servers, { type: "direct", tag: "direct" }],
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(config, null, 2), "utf-8");
  console.error(`Parsed ${servers.length} server(s) -> ${OUT_PATH}`);
  console.error("Run service-restart.bat (or start.bat) to apply.");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
