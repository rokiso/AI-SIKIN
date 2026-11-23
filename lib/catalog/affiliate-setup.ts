import "server-only";
import {
  AffiliateConfigurationError,
  getAffiliateHosts,
  getAffiliatePartnerConfiguration,
} from "@/lib/server-env";
import { safeAffiliateUrl } from "./affiliate-url";
export function checkAffiliateSetup() {
  const invalidFields: string[] = [];
  try {
    getAffiliatePartnerConfiguration();
  } catch (error) {
    if (!(error instanceof AffiliateConfigurationError)) throw error;
    invalidFields.push(...error.invalidFields);
  }
  const hosts = getAffiliateHosts();
  try {
    if (!hosts.size) throw Error("Missing hosts");
    for (const host of hosts) safeAffiliateUrl(`https://${host}/`);
  } catch {
    invalidFields.push("CATALOG_AFFILIATE_HOSTS");
  }
  return {
    configurationValid: invalidFields.length === 0,
    invalidFields,
    configuredHostCount: hosts.size,
    scope: "LOCAL_CONFIGURATION_ONLY",
    partnerRegistration: "NOT_VERIFIED",
    settlement: "NOT_VERIFIED",
    providerTrackingContract: "NOT_VERIFIED",
    productLinks: "NOT_VERIFIED",
    trackingStrategy: "PRESERVE_PROVIDER_ISSUED_URL",
    liveActivation: "NOT_CHANGED",
  };
}
