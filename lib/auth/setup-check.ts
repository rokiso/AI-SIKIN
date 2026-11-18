import "server-only";
import { getOAuthConfiguration, OAuthConfigurationError } from "@/lib/server-env";
import type { OAuthConfigurationField } from "@/lib/server-env";

export function checkOAuthSetup() {
  const providers = (["google", "kakao"] as const).map((provider) => {
    try {
      const configuration = getOAuthConfiguration(provider);
      return {
        provider,
        environmentValid: true,
        callbackUrl: configuration.callbackUrl,
        invalidFields: [] as OAuthConfigurationField[],
      };
    } catch (error) {
      if (!(error instanceof OAuthConfigurationError)) throw error;
      return {
        provider,
        environmentValid: false,
        callbackUrl: null,
        invalidFields: error.invalidFields,
      };
    }
  });
  return {
    environmentValid: providers.every((provider) => provider.environmentValid),
    scope: "LOCAL_ENVIRONMENT_ONLY",
    providers,
    consoleRegistration: "NOT_VERIFIED",
    liveTokenExchange: "NOT_VERIFIED",
    kakaoPkceEnforcement: "NOT_VERIFIED",
  };
}
