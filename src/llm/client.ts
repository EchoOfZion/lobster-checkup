// ============================================================
// 龙虾体检 v4 — LLM 客户端
// 封装 LLM API 调用，支持 Anthropic Claude API。
// ============================================================

export interface LLMConfig {
  apiKey: string
  model?: string           // default: claude-haiku-3-5
  maxTokens?: number       // default: 1024
  baseUrl?: string         // default: https://api.anthropic.com
}

export interface LLMResponse {
  text: string
  inputTokens: number
  outputTokens: number
}

const DEFAULT_MODEL = 'claude-haiku-3-5-20241022'
const DEFAULT_MAX_TOKENS = 1024
const DEFAULT_BASE_URL = 'https://api.anthropic.com'

/**
 * Call the Anthropic Messages API.
 * Uses haiku by default to minimize cost for diagnostic checks.
 */
export async function llmCall(
  prompt: string,
  systemPrompt: string,
  config: LLMConfig,
): Promise<LLMResponse> {
  const model = config.model || DEFAULT_MODEL
  const maxTokens = config.maxTokens || DEFAULT_MAX_TOKENS
  const baseUrl = config.baseUrl || DEFAULT_BASE_URL

  const response = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`LLM API error ${response.status}: ${errorText}`)
  }

  const data = await response.json() as {
    content: { type: string; text: string }[]
    usage: { input_tokens: number; output_tokens: number }
  }

  const text = data.content
    .filter(c => c.type === 'text')
    .map(c => c.text)
    .join('\n')

  return {
    text,
    inputTokens: data.usage.input_tokens,
    outputTokens: data.usage.output_tokens,
  }
}

/**
 * Parse a JSON response from the LLM.
 * Handles markdown code blocks and plain JSON.
 */
export function parseLLMJson<T>(text: string): T | null {
  // Try to extract JSON from markdown code block
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/)
  const jsonStr = codeBlockMatch ? codeBlockMatch[1] : text

  try {
    return JSON.parse(jsonStr.trim()) as T
  } catch {
    return null
  }
}

/**
 * Check if LLM is available (API key configured).
 */
export function isLLMAvailable(config: Partial<LLMConfig> | undefined): boolean {
  return !!config?.apiKey
}
