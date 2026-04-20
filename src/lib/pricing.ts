// ============================================================
// 龙虾体检 v4 — 模型价格表
// ============================================================

// USD per 1K tokens
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4-6':          { input: 0.015,   output: 0.075 },
  'claude-sonnet-4-6':        { input: 0.003,   output: 0.015 },
  'claude-haiku-3-5':         { input: 0.0008,  output: 0.004 },
  'gemini-3-pro':             { input: 0.00125, output: 0.005 },
  'gemini-3-flash':           { input: 0.0001,  output: 0.0004 },
  'gemini-3-flash-preview':   { input: 0.0001,  output: 0.0004 },
  'gpt-4o':                   { input: 0.005,   output: 0.015 },
  'gpt-4o-mini':              { input: 0.00015, output: 0.0006 },
  'gpt-5':                    { input: 0.010,   output: 0.040 },
  'gpt-5.4':                  { input: 0.010,   output: 0.040 },
  'gpt-5-mini':               { input: 0.002,   output: 0.008 },
}

// Fallback: use claude-sonnet pricing for unknown models
const FALLBACK_PRICING = { input: 0.003, output: 0.015 }

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  // Try exact match first, then prefix match
  let pricing = MODEL_PRICING[model]
  if (!pricing) {
    const key = Object.keys(MODEL_PRICING).find(k => model.startsWith(k) || model.includes(k))
    pricing = key ? MODEL_PRICING[key] : FALLBACK_PRICING
  }
  return (inputTokens / 1000) * pricing.input + (outputTokens / 1000) * pricing.output
}

// Determine if a model is "expensive" (top-tier)
export function isExpensiveModel(model: string): boolean {
  const pricing = MODEL_PRICING[model]
  if (!pricing) return false
  return pricing.output >= 0.015 // >= claude-sonnet output pricing
}
