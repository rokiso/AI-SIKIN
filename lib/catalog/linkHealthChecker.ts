import "server-only";
import { request } from "node:https";
import { lookup } from "node:dns";
import type { LookupFunction } from "node:net";
import { safeAffiliateUrl } from "./affiliate-url";

// Reject non-public addresses, including mapped IPv4 and IPv6 local ranges.
export function isPublicAddress(address: string): boolean {
  if (address.includes(":"))
    return /^[23][0-9a-f]{0,3}:/i.test(address) && !/^2001:(db8|0):/i.test(address);
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255))
    return false;
  const [a, b] = parts;
  return (
    a > 0 &&
    a < 224 &&
    a !== 10 &&
    a !== 127 &&
    !(a === 169 && b === 254) &&
    !(a === 172 && b >= 16 && b <= 31) &&
    !(a === 192 && (b === 168 || b === 0)) &&
    !(a === 100 && b >= 64 && b <= 127) &&
    !(a === 198 && [18, 19].includes(b))
  );
}
const publicLookup: LookupFunction = (host, options, callback) => {
  lookup(host, { all: true }, (error, addresses) => {
    if (error) {
      callback(error, "", 4);
      return;
    }
    if (!addresses.length || addresses.some((entry) => !isPublicAddress(entry.address))) {
      callback(new Error("Non-public affiliate address"), "", 4);
      return;
    }
    // Pin the validated DNS answer to this socket; no second resolver lookup.
    if (options.all) callback(null, addresses);
    else callback(null, addresses[0].address, addresses[0].family);
  });
};
async function checkUrl(
  value: string,
  method: "HEAD" | "GET",
  signal: AbortSignal,
): Promise<{ status: number; location?: string }> {
  const url = safeAffiliateUrl(value);
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method,
        signal,
        lookup: publicLookup,
        agent: false,
        headers: {
          "User-Agent": "SKIN-Link-Check/1.0",
          ...(method === "GET" ? { Range: "bytes=0-0" } : {}),
        },
      },
      (response) => {
        resolve({ status: response.statusCode ?? 0, location: response.headers.location });
        response.destroy();
      },
    );
    req.on("error", reject);
    req.end();
  });
}
export type LinkProbe = {
  status: "HEALTHY" | "UNHEALTHY" | "TIMEOUT" | "REDIRECT_LOOP";
  httpStatusCode: number | null;
  responseTimeMs: number;
  errorMessage: string | null;
};

export async function probeAffiliateLink(value: string): Promise<LinkProbe> {
  const start = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  let httpStatusCode: number | null = null;
  const result = (status: LinkProbe["status"], errorMessage: string | null = null): LinkProbe => ({
    status,
    httpStatusCode,
    responseTimeMs: Math.round(performance.now() - start),
    errorMessage,
  });
  try {
    let current = safeAffiliateUrl(value).href;
    const visited = new Set<string>();
    while (visited.size < 4 && !visited.has(current)) {
      visited.add(current);
      let response = await checkUrl(current, "HEAD", controller.signal);
      httpStatusCode = response.status || null;
      if ([403, 405, 501].includes(response.status)) {
        response = await checkUrl(current, "GET", controller.signal);
        httpStatusCode = response.status || null;
      }
      if (response.status >= 200 && response.status < 300) return result("HEALTHY");
      if (response.status < 300 || response.status >= 400 || !response.location)
        return result("UNHEALTHY", response.status === 403 ? "ACCESS_DENIED" : "HTTP_FAILURE");
      current = safeAffiliateUrl(new URL(response.location, current).href).href;
    }
    return result("REDIRECT_LOOP", "REDIRECT_LIMIT");
  } catch {
    return controller.signal.aborted
      ? result("TIMEOUT", "DEADLINE_EXCEEDED")
      : result("UNHEALTHY", "REQUEST_OR_DESTINATION_REJECTED");
  } finally {
    clearTimeout(timer);
  }
}
