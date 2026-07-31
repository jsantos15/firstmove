const fs = require("fs");
const path = require("path");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function loadScriptEnv() {
  loadEnvFile(path.resolve(__dirname, "..", ".env"));
}

function isLocalSupabaseUrl(value) {
  return (
    typeof value === "string" &&
    (value.startsWith("http://127.0.0.1:54321") ||
      value.startsWith("http://localhost:54321"))
  );
}

function assertLocalPipelineSupabaseUrl(supabaseUrl, label = "opening pipeline") {
  if (process.env.FIRSTMOVE_ALLOW_CLOUD_PIPELINE === "1") {
    return;
  }

  if (isLocalSupabaseUrl(supabaseUrl)) {
    return;
  }

  throw new Error(
    `${label} refuses to write to non-local Supabase URL: ${
      supabaseUrl || "missing"
    }. Set NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 and SUPABASE_SERVICE_ROLE_KEY to the local Secret key in scripts/.env, or set FIRSTMOVE_ALLOW_CLOUD_PIPELINE=1 for an intentional cloud write.`
  );
}

module.exports = {
  assertLocalPipelineSupabaseUrl,
  loadEnvFile,
  loadScriptEnv,
};
