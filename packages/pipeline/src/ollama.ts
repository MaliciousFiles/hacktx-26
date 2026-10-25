// Offline-only transport. Callers cache validated results, never credentials.
export interface OllamaConfig {
  ollamaApiKey?: string;
  ollamaBaseUrl?: string;
  ollamaModel: string;
  /** Immutable model revision recorded in cache keys and release provenance. */
  ollamaModelVersion: string;
}

export function assertPinnedVersion(version: string): void {
  if (!version.trim() || /latest|preview/i.test(version)) {
    throw new Error("Configure an explicit model version; latest/preview are not publishable");
  }
}

export async function ollamaJson<T>(
  prompt: string,
  config: OllamaConfig,
  parse: (value: unknown) => T,
): Promise<T> {
  assertPinnedVersion(config.ollamaModelVersion);
  const base = new URL(config.ollamaBaseUrl ?? "https://ollama.com");
  if (base.username || base.password || base.search || base.hash) {
    throw new Error("Ollama base URL must not contain credentials, query parameters or fragments");
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname);
  if (base.protocol !== "https:" && !(local && base.protocol === "http:")) {
    throw new Error("Use HTTPS for remote Ollama endpoints");
  }
  if (base.hostname === "ollama.com" && !config.ollamaApiKey) {
    throw new Error("OLLAMA_API_KEY is required for Ollama Cloud");
  }
  const response = await fetch(`${base.href.replace(/\/$/, "")}/api/chat`, {
    method: "POST",
    signal: AbortSignal.timeout(120_000),
    headers: {
      "Content-Type": "application/json",
      ...(config.ollamaApiKey ? { Authorization: `Bearer ${config.ollamaApiKey}` } : {}),
    },
    body: JSON.stringify({
      model: config.ollamaModel,
      messages: [{ role: "user", content: prompt }],
      stream: false,
      // Cloud does not enforce structured output; validate locally in both modes.
      ...(local ? { format: "json" } : {}),
      options: { temperature: 0 },
    }),
  });
  // Provider bodies may contain secrets or source text. Never include them in errors.
  if (!response.ok) throw new Error(`Ollama request failed (HTTP ${response.status})`);
  const body = (await response.json()) as { message?: { content?: unknown }; done?: boolean };
  if (body.done !== true || typeof body.message?.content !== "string") {
    throw new Error("Ollama returned an incomplete or missing message");
  }
  const raw = body.message.content
    .trim()
    .replace(/^```(?:json)?\s*\n?/, "")
    .replace(/\n?```$/, "");
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("Ollama returned invalid JSON");
  }
  return parse(value);
}

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid model object");
  return value as Record<string, unknown>;
}

export function probability(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error("Invalid model probability");
  }
  return value;
}
