import type { Api, Model } from "@mariozechner/pi-ai";

function isOpenAiCompletionsModel(model: Model<Api>): model is Model<"openai-completions"> {
  return model.api === "openai-completions";
}

function isDashScopeCompatibleEndpoint(baseUrl: string): boolean {
  return (
    baseUrl.includes("dashscope.aliyuncs.com") ||
    baseUrl.includes("dashscope-intl.aliyuncs.com") ||
    baseUrl.includes("dashscope-us.aliyuncs.com")
  );
}

function isAnthropicMessagesModel(model: Model<Api>): model is Model<"anthropic-messages"> {
  return model.api === "anthropic-messages";
}

/**
 * pi-ai constructs the Anthropic API endpoint as `${baseUrl}/v1/messages`.
 * If a user configures `baseUrl` with a trailing `/v1` (e.g. the previously
 * recommended format "https://api.anthropic.com/v1"), the resulting URL
 * becomes "…/v1/v1/messages" which the Anthropic API rejects with a 404.
 *
 * Strip a single trailing `/v1` (with optional trailing slash) from the
 * baseUrl for anthropic-messages models so users with either format work.
 */
function normalizeAnthropicBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/v1\/?$/, "");
}
export function normalizeModelCompat(model: Model<Api>): Model<Api> {
  const baseUrl = model.baseUrl ?? "";

  // Normalise anthropic-messages baseUrl: strip trailing /v1 that users may
  // have included in their config. pi-ai appends /v1/messages itself.
  if (isAnthropicMessagesModel(model) && baseUrl) {
    const normalised = normalizeAnthropicBaseUrl(baseUrl);
    if (normalised !== baseUrl) {
      return { ...model, baseUrl: normalised } as Model<"anthropic-messages">;
    }
  }

  const isZai = model.provider === "zai" || baseUrl.includes("api.z.ai");
  const isMoonshot =
    model.provider === "moonshot" ||
    baseUrl.includes("moonshot.ai") ||
    baseUrl.includes("moonshot.cn");
  const isDashScopeProvider = model.provider === "dashscope";
  const isDashScopeOfficialEndpoint = isDashScopeCompatibleEndpoint(baseUrl);
  const isDashScope = isDashScopeProvider || isDashScopeOfficialEndpoint;
  const compatConfig = (model as { compat?: Record<string, unknown> }).compat ?? {};
  const relayToolCompat = compatConfig.relayToolCompat === true;

  // For relay endpoints using openai-responses API, force Chat Completions style
  // tool payloads (e.g. /responses -> /chat/completions rewrites).
  if (relayToolCompat && model.api === "openai-responses") {
    return {
      ...model,
      compat: { ...compatConfig, useChatCompletionsToolFormat: true },
    } as Model<"openai-responses">;
  }

  if ((!isZai && !isMoonshot && !isDashScope) || !isOpenAiCompletionsModel(model)) {
    return model;
  }

  const openaiModel = model;
  const compat = openaiModel.compat ?? undefined;

  // For relay endpoints with explicit compat,
  // the API may not accept role: "tool" - use role: "developer" instead.
  const needsToolResultRole = relayToolCompat;
  if (compat?.supportsDeveloperRole === false && !needsToolResultRole) {
    return model;
  }

  const extraCompat = needsToolResultRole
    ? { toolResultRole: "developer" as const, requiresAssistantContentAsString: true }
    : {};

  openaiModel.compat = compat
    ? { ...compat, supportsDeveloperRole: false, ...extraCompat }
    : { supportsDeveloperRole: false, ...extraCompat };
  return openaiModel;
}
