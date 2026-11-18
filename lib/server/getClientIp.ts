import "server-only";
import { isIP } from "node:net";
import { getConsentTrustedIpHeader } from "@/lib/server-env";
export function consentRequestMetadata(headers: Headers) {
  // Trust must come from deployment configuration and an overwriting ingress,
  // never from a caller-supplied header or a syntactically valid address alone.
  const trusted = getConsentTrustedIpHeader();
  const raw = trusted ? headers.get(trusted) : null;
  const first = raw && raw.length <= 4096 ? raw.split(",", 1)[0].trim() : "";
  const ipAddress = first && isIP(first) ? first : null;
  return {
    ipAddress,
    ipSource: ipAddress ? "TRUSTED_HEADER" : "UNAVAILABLE",
    userAgent:
      headers
        .get("user-agent")
        ?.replace(/[\u0000-\u001f\u007f]/g, "")
        .slice(0, 512) || null,
  };
}
