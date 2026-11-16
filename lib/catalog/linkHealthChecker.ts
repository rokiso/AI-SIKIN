import "server-only";
import { request } from "node:https";
import { lookup } from "node:dns";
import type { LookupFunction } from "node:net";
import { getPrisma } from "@/lib/prisma";
import { safeAffiliateUrl } from "./affiliate-url";
import { invalidateProductCache } from "./curationService";

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
export async function probeAffiliateLink(value: string): Promise<boolean> {
  const signal = AbortSignal.timeout(3000);
  try {
    let current = safeAffiliateUrl(value).href;
    for (let redirects = 0; redirects <= 3; redirects++) {
      let response = await checkUrl(current, "HEAD", signal);
      if ([405, 501].includes(response.status)) response = await checkUrl(current, "GET", signal);
      if (response.status >= 200 && response.status < 300) return true;
      if (response.status >= 300 && response.status < 400 && response.location) {
        current = safeAffiliateUrl(new URL(response.location, current).href).href;
      } else return false;
    }
    return false;
  } catch {
    return false;
  }
}
export async function checkProductLinks(
  probe: (url: string) => Promise<boolean> = probeAffiliateLink,
) {
  const prisma = getPrisma();
  const products = await prisma.product.findMany({
    where: { isActive: true, status: { in: ["ACTIVE", "UNAVAILABLE"] } },
    take: 2048,
    orderBy: { id: "asc" },
  });
  let checked = 0;
  let unavailable = 0;
  for (const product of products) {
    const healthy = await probe(product.affiliateBaseUrl);
    await prisma.$transaction(async (tx) => {
      const updated = await tx.product.updateMany({
        where: { id: product.id, isActive: true, updatedAt: product.updatedAt },
        data: healthy
          ? { healthCheckFailCount: 0, lastCheckedAt: new Date(), status: "ACTIVE" }
          : { healthCheckFailCount: { increment: 1 }, lastCheckedAt: new Date() },
      });
      if (!updated.count) return;
      if (!healthy) {
        const disabled = await tx.product.updateMany({
          where: { id: product.id, healthCheckFailCount: { gte: 3 }, status: "ACTIVE" },
          data: { status: "UNAVAILABLE" },
        });
        unavailable += disabled.count;
      }
      checked++;
    });
  }
  invalidateProductCache();
  return { checked, unavailable };
}
