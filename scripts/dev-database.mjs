import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync, readFileSync, appendFileSync, chmodSync } from "node:fs";
import { parse } from "dotenv";
import { spawnSync } from "node:child_process";

const action = process.argv[2];
if (action !== "up" && action !== "stop") throw new Error("Use up or stop");
if (action === "up" && !existsSync(".env")) {
  const password = randomBytes(32).toString("hex");
  writeFileSync(
    ".env",
    [
      "POSTGRES_DB=sikin_dev",
      "POSTGRES_USER=sikin_app",
      `POSTGRES_PASSWORD=${password}`,
      `DATABASE_URL=postgresql://sikin_app:${password}@127.0.0.1:55432/sikin_dev`,
      "ALLOW_SAMPLE_SEED=false",
      "",
    ].join("\n"),
    { mode: 0o600, flag: "wx" },
  );
  console.log("Created ignored local .env with private development credentials.");
}

if (action === "up" && existsSync(".env")) {
  const configured = parse(readFileSync(".env"));
  if (!configured.AUTH_COOKIE_SECRET && !process.env.AUTH_COOKIE_SECRET) {
    appendFileSync(".env", `\nAUTH_COOKIE_SECRET=${randomBytes(32).toString("hex")}\n`);
    chmodSync(".env", 0o600);
    console.log("Prepared private local guest-session signing configuration.");
  }
}

// Always use the managed local Docker daemon, never a saved remote context.
const environment = { ...process.env };
for (const name of [
  "DOCKER_HOST",
  "DOCKER_CONTEXT",
  "DOCKER_TLS",
  "DOCKER_TLS_VERIFY",
  "DOCKER_CERT_PATH",
])
  delete environment[name];
const args = [
  "--host=unix:///var/run/docker.sock",
  "compose",
  ...(action === "up" ? ["up", "--detach", "--wait"] : ["stop"]),
];
const result = spawnSync("docker", args, { stdio: "inherit", env: environment });
if (result.error)
  throw new Error("Local Docker could not be started. Check the managed Docker daemon.");
process.exitCode = result.status ?? 1;
