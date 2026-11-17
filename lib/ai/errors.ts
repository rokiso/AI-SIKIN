import "server-only";

export class AiGatewayError extends Error {
  readonly fallbackTriggered = true;
  auditLogId?: string;
  auditWrite?: Promise<"SAVED" | "FAILED">;

  constructor(
    readonly code = "AI_PROVIDER_ERROR",
    message = "AI 연결을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    readonly httpStatus = 502,
  ) {
    super(message);
    this.name = "AiGatewayError";
  }
}

export class AiTimeoutError extends AiGatewayError {
  constructor() {
    super("AI_GATEWAY_TIMEOUT", "AI 응답 제한 시간을 초과했습니다. 다시 시도해 주세요.", 504);
    this.name = "AiTimeoutError";
  }
}

export class AiConfigurationError extends AiGatewayError {
  constructor() {
    super("AI_CONFIGURATION_UNAVAILABLE", "AI 연결 설정을 확인해 주세요.", 503);
    this.name = "AiConfigurationError";
  }
}
