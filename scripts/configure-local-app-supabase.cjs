#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT_DIR = path.resolve(__dirname, "..");
const WEB_ENV_PATH = path.join(ROOT_DIR, "apps", "web", ".env.local");
const WEB_CLOUD_BACKUP_PATH = path.join(ROOT_DIR, "apps", "web", ".env.cloud.local");
const MOBILE_ENV_PATH = path.join(ROOT_DIR, "apps", "mobile", ".env.local");

function parseArgs(argv) {
  const args = { check: null, mobileHost: null };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--check") {
      args.check = argv[index + 1] ?? "all";
      index += 1;
    } else if (token === "--mobile-host") {
      args.mobileHost = argv[index + 1];
      index += 1;
    } else if (token === "--help" || token === "-h") {
      console.log(`Usage:
  node scripts/configure-local-app-supabase.cjs
  node scripts/configure-local-app-supabase.cjs --mobile-host 192.168.1.100
  node scripts/configure-local-app-supabase.cjs --check web|mobile|all`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }

  if (args.check && !["web", "mobile", "all"].includes(args.check)) {
    throw new Error("--check must be web, mobile, or all.");
  }

  return args;
}

function parseEnvText(text) {
  const values = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function readEnvFile(filePath) {
  return fs.existsSync(filePath)
    ? parseEnvText(fs.readFileSync(filePath, "utf8"))
    : {};
}

function isPrivateIpv4(hostname) {
  const octets = hostname.split(".").map(Number);
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value))) return false;
  return (
    octets[0] === 10 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  );
}

function isLocalDevelopmentUrl(value) {
  try {
    const hostname = new URL(value).hostname.replace(/^\[|\]$/g, "").toLowerCase();
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      isPrivateIpv4(hostname)
    );
  } catch {
    return false;
  }
}

function getLocalSupabaseStatus() {
  const result = spawnSync("supabase", ["status", "-o", "env"], {
    cwd: ROOT_DIR,
    encoding: "utf8",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    throw new Error(
      "Local Supabase is not running. Start Docker Desktop, run `supabase start`, then retry."
    );
  }

  const values = parseEnvText(result.stdout);
  const apiUrl = values.API_URL;
  const publishableKey = values.PUBLISHABLE_KEY || values.ANON_KEY;

  if (!apiUrl || !publishableKey) {
    throw new Error("`supabase status -o env` did not return an API URL and public key.");
  }
  if (!isLocalDevelopmentUrl(apiUrl)) {
    throw new Error(`Supabase CLI returned a non-local API URL: ${apiUrl}`);
  }

  return { apiUrl, publishableKey };
}

function privateAddressScore(interfaceName, address) {
  const name = interfaceName.toLowerCase();
  let score = 0;
  if (/wi-?fi|wlan|ethernet|^en\d/.test(name)) score += 100;
  if (/vpn|nord|tailscale|wsl|vethernet|hyper-v|virtual/.test(name)) score -= 200;
  if (address.startsWith("192.168.")) score += 30;
  else if (address.startsWith("10.")) score += 20;
  else if (address.startsWith("172.")) score += 10;
  return score;
}

function detectMobileHost() {
  const candidates = [];
  for (const [interfaceName, addresses] of Object.entries(os.networkInterfaces())) {
    for (const address of addresses ?? []) {
      const family = typeof address.family === "string" ? address.family : String(address.family);
      if (family !== "IPv4" && family !== "4") continue;
      if (address.internal || !isPrivateIpv4(address.address)) continue;
      candidates.push({
        address: address.address,
        score: privateAddressScore(interfaceName, address.address),
      });
    }
  }

  candidates.sort((left, right) => right.score - left.score);
  if (!candidates.length) {
    throw new Error(
      "Could not detect a LAN IPv4 address for Expo. Pass `--mobile-host <computer-lan-ip>`."
    );
  }
  return candidates[0].address;
}

function replaceManagedEnv(filePath, values, removedKeys = []) {
  const managedKeys = new Set([...Object.keys(values), ...removedKeys]);
  const existingLines = fs.existsSync(filePath)
    ? fs.readFileSync(filePath, "utf8").split(/\r?\n/)
    : [];
  const retainedLines = existingLines.filter((line) => {
    const match = line.match(/^\s*([^#=]+)\s*=/);
    return !match || !managedKeys.has(match[1].trim());
  });

  while (retainedLines.length && !retainedLines[retainedLines.length - 1].trim()) {
    retainedLines.pop();
  }
  if (retainedLines.length) retainedLines.push("");
  retainedLines.push("# Managed by scripts/configure-local-app-supabase.cjs");
  for (const [key, value] of Object.entries(values)) {
    retainedLines.push(`${key}=${value}`);
  }
  retainedLines.push("");

  fs.writeFileSync(filePath, retainedLines.join(os.EOL), "utf8");
}

function preserveCloudWebEnvironment() {
  if (!fs.existsSync(WEB_ENV_PATH) || fs.existsSync(WEB_CLOUD_BACKUP_PATH)) return;
  const current = readEnvFile(WEB_ENV_PATH);
  if (current.NEXT_PUBLIC_SUPABASE_URL && !isLocalDevelopmentUrl(current.NEXT_PUBLIC_SUPABASE_URL)) {
    fs.copyFileSync(WEB_ENV_PATH, WEB_CLOUD_BACKUP_PATH);
    console.log("Preserved the previous cloud web configuration in apps/web/.env.cloud.local.");
  }
}

function mobileApiUrl(apiUrl, mobileHost) {
  const url = new URL(apiUrl);
  url.hostname = mobileHost;
  return url.toString().replace(/\/$/, "");
}

async function assertReachable(label, url, key) {
  let response;
  try {
    response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(5000),
    });
  } catch (error) {
    throw new Error(`${label} cannot reach local Supabase at ${url}: ${error.message}`);
  }
  if (!response.ok) {
    throw new Error(`${label} local Supabase health check returned HTTP ${response.status}.`);
  }
}

async function checkEnvironment(label, filePath, urlKey, publicKeyKey, targetKey) {
  const values = readEnvFile(filePath);
  const url = values[urlKey];
  const publicKey = values[publicKeyKey];
  if (!url || !publicKey || values[targetKey] !== "local") {
    throw new Error(`${label} is not configured for local Supabase. Run \`pnpm supabase:configure-local-apps\`.`);
  }
  if (!isLocalDevelopmentUrl(url)) {
    throw new Error(`${label} refuses the non-local Supabase URL ${url}.`);
  }
  await assertReachable(label, url, publicKey);
  console.log(`${label}: local Supabase target verified at ${url}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.check) {
    if (args.check === "web" || args.check === "all") {
      await checkEnvironment(
        "Web app",
        WEB_ENV_PATH,
        "NEXT_PUBLIC_SUPABASE_URL",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY",
        "NEXT_PUBLIC_SUPABASE_TARGET"
      );
    }
    if (args.check === "mobile" || args.check === "all") {
      await checkEnvironment(
        "Mobile app",
        MOBILE_ENV_PATH,
        "EXPO_PUBLIC_SUPABASE_URL",
        "EXPO_PUBLIC_SUPABASE_ANON_KEY",
        "EXPO_PUBLIC_SUPABASE_TARGET"
      );
    }
    return;
  }

  const { apiUrl, publishableKey } = getLocalSupabaseStatus();
  const mobileHost = args.mobileHost || detectMobileHost();
  const expoApiUrl = mobileApiUrl(apiUrl, mobileHost);

  preserveCloudWebEnvironment();
  replaceManagedEnv(
    WEB_ENV_PATH,
    {
      NEXT_PUBLIC_SUPABASE_URL: apiUrl,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: publishableKey,
      NEXT_PUBLIC_SUPABASE_TARGET: "local",
    },
    ["SUPABASE_SERVICE_ROLE_KEY"]
  );
  replaceManagedEnv(MOBILE_ENV_PATH, {
    EXPO_PUBLIC_SUPABASE_URL: expoApiUrl,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: publishableKey,
    EXPO_PUBLIC_SUPABASE_TARGET: "local",
  });

  console.log(`Web app configured for ${apiUrl}`);
  console.log(`Mobile app configured for ${expoApiUrl}`);
  console.log("Local public keys were written only to gitignored app environment files.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
