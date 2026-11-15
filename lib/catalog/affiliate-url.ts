import "server-only";
import { isIP } from "node:net";
import { getAffiliateHosts } from "@/lib/server-env";

export function safeAffiliateUrl(value: string): URL {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.hash ||
    isIP(host) ||
    host.includes(":") ||
    !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) ||
    host.endsWith(".invalid") ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    !getAffiliateHosts().has(host)
  )
    throw new Error("Unapproved affiliate destination");
  return url;
}
export function isAffiliateUrlAllowed(value: string): boolean {
  try {
    safeAffiliateUrl(value);
    return true;
  } catch {
    return false;
  }
}
export function trackedAffiliateUrl(value: string, clickId: string): string {
  const url = safeAffiliateUrl(value);
  // Do not send report IDs, skin type, user IDs or guest credentials to sellers.
  for (const name of ["reportId", "userId", "guestDeviceId", "sub_id"])
    url.searchParams.delete(name);
  url.searchParams.set("utm_source", "aiskin");
  url.searchParams.set("utm_medium", "recommendation");
  url.searchParams.set("utm_campaign", "report_curation");
  url.searchParams.set("click_id", clickId);
  return url.href;
}
