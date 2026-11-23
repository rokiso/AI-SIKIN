// Loaded only by playwright.core.config.ts, never by the application build.
import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import nock from "nock";
if (process.env.CORE_E2E_MOCKS !== "1" || process.env.S3_ENDPOINT !== "https://core-vault.invalid")
  throw new Error("Core fixtures require their isolated test configuration");
const database = new URL(process.env.DATABASE_URL ?? "");
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(database.hostname) ||
  database.port !== "55432" ||
  !["/sikin_dev", "/sikin_test"].includes(database.pathname) ||
  database.search ||
  process.env.AI_API_KEY !== "core-e2e-dummy-key" ||
  process.env.AWS_ACCESS_KEY_ID !== "core-e2e-dummy"
)
  throw new Error("Core mocks require an isolated local database and dummy credentials");
nock.disableNetConnect();
nock.enableNetConnect(/^(localhost|127\.0\.0\.1)(:\d+)?$/);
const objects = new Map();
const codes = new Map();
const tokens = new Map();
const metrics = { uploads: 0, heads: 0, imageReads: 0, ai: 0, pkce: 0 };
const pathOf = (uri) =>
  new URL(
    typeof uri === "object" && uri !== null && "url" in uri ? uri.url : uri,
    "https://core-vault.invalid",
  ).pathname;
nock("https://core-vault.invalid")
  .persist()
  .head(/.*/)
  .reply(function (uri) {
    const obj = objects.get(pathOf(uri));
    if (!obj) return [404];
    metrics.heads++;
    return [
      200,
      "",
      {
        "Content-Length": String(obj.bytes.length),
        "Content-Type": obj.type,
        ETag: obj.etag,
        "x-amz-server-side-encryption": "AES256",
      },
    ];
  });
nock("https://core-vault.invalid")
  .persist()
  .get(/.*/)
  .reply((uri) => {
    const obj = objects.get(pathOf(uri));
    if (!obj) return [404];
    metrics.imageReads++;
    return [200, obj.bytes, { "Content-Type": obj.type }];
  });
nock("https://api.openai.com")
  .persist()
  .post("/v1/responses")
  .reply(200, () => {
    metrics.ai++;
    return {
      status: "completed",
      output: [
        {
          content: [
            {
              type: "output_text",
              text: JSON.stringify({
                extractedFeatures: {
                  visualOilinessHint: "OILY",
                  visualErythemaScore: 75,
                  visualPigmentScore: 20,
                  visualPoreWrinkleScore: 70,
                  confidenceScore: 0.9,
                },
                clinicalImpressionSummary:
                  "로컬 모의 사진 참고 정보입니다. 문진과 함께 일상 관리에 참고해 주세요.",
                recommendedActiveIngredients: ["판테놀", "세라마이드"],
                cautionIngredients: ["향료"],
              }),
            },
          ],
        },
      ],
      usage: { input_tokens: 100, output_tokens: 80, total_tokens: 180 },
    };
  });
nock("https://oauth2.googleapis.com")
  .persist()
  .post("/token")
  .reply(async function (request) {
    const input = new URLSearchParams(await request.text());
    const code = input.get("code");
    const item = codes.get(code);
    if (
      !item ||
      createHash("sha256")
        .update(input.get("code_verifier") ?? "")
        .digest("base64url") !== item.challenge ||
      input.get("redirect_uri") !== "https://core-app.invalid/auth/callback/google"
    )
      return [400, { error: "invalid_grant" }];
    codes.delete(code);
    metrics.pkce++;
    const token = randomUUID();
    tokens.set(token, item.account);
    return [200, { access_token: token, token_type: "Bearer" }];
  });
nock("https://openidconnect.googleapis.com")
  .persist()
  .get("/v1/userinfo")
  .reply(function (request) {
    const account = tokens.get(String(request.headers.get("authorization")).replace("Bearer ", ""));
    return account ? [200, { sub: account, name: "로컬 여정 검증 회원" }] : [401, {}];
  });
const server = createServer(async (req, res) => {
  if (req.url === "/health") {
    res.end("ready");
    return;
  }
  if (req.url === "/metrics") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(metrics));
    return;
  }
  const chunks = [];
  let size = 0;
  for await (const part of req) {
    size += part.length;
    if (size > 11 * 1024 * 1024) {
      res.writeHead(413).end();
      return;
    }
    chunks.push(part);
  }
  const bytes = Buffer.concat(chunks);
  if (req.method === "POST" && req.url === "/object") {
    const path = req.headers["x-object-path"];
    if (
      typeof path !== "string" ||
      !/^\/sikin-core-test\.invalid\/raw-faces\/[a-f0-9-]+\.jpeg$/.test(path)
    ) {
      res.writeHead(400).end();
      return;
    }
    const etag = '"' + createHash("md5").update(bytes).digest("hex") + '"';
    objects.set(path, { bytes, type: "image/jpeg", etag });
    metrics.uploads++;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ etag }));
    return;
  }
  if (req.method === "POST" && req.url === "/oauth") {
    const data = JSON.parse(bytes.toString());
    if (typeof data.challenge !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(data.challenge)) {
      res.writeHead(400).end();
      return;
    }
    const code = randomUUID();
    codes.set(code, { challenge: data.challenge, account: randomUUID() });
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ code }));
    return;
  }
  res.writeHead(404).end();
});
server.listen(3101, "127.0.0.1");
