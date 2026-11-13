import { AiError, type ProviderResult } from '../types'
import { MAX_OUTPUT_TOKENS } from '../defaults'
import { normalizeUsage, toNetworkError, type ProviderArgs } from './shared'
import { getT } from '@/lib/i18n/translate'

const t = getT('LibErrors')

/**
 * Google Gemini API base URL. The `generateContent` endpoint accepts a
 * model id (e.g. `gemini-3.5-flash`) and returns candidates plus
 * token usage in a different shape than OpenAI/Anthropic — see
 * `GeminiResponse` below.
 */
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'

interface GeminiResponse {
  candidates?: {
    content?: {
      parts?: { text?: string }[]
    }
  }[]
  usageMetadata?: {
    promptTokenCount?: number
    candidatesTokenCount?: number
    totalTokenCount?: number
  }
  error?: { message?: string }
}

/**
 * Build the `contents` array Gemini expects: the caller's `messages`
 * (oldest first) mapped onto `{ role, parts }`.
 */
function toGeminiContents(messages: ProviderArgs['messages']): {
  role: 'user' | 'model'
  parts: { text: string }[]
}[] {
  return messages.map((m) => ({
    role: m.role === 'assistant' ? ('model' as const) : ('user' as const),
    parts: [{ text: m.content }],
  }))
}

/**
 * Call Google Gemini's `generateContent` endpoint with the caller's own
 * key. Returns the raw assistant text + normalized token usage.
 *
 * Gemini's role names differ from OpenAI (`model` instead of
 * `assistant`), and the response shape is `candidates[0].content.parts`
 * + `usageMetadata`, not `choices[0].message.content` + `usage`.
 */
export async function generateGemini(args: ProviderArgs): Promise<ProviderResult> {
  const { apiKey, model, systemPrompt, messages, timeoutMs } = args

  const endpoint = `${GEMINI_BASE_URL}/${encodeURIComponent(model)}:generateContent`

  const body: Record<string, unknown> = {
    contents: toGeminiContents(messages),
    generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS },
  }
  if (systemPrompt) {
    body.systemInstruction = { parts: [{ text: systemPrompt }] }
  }

  let res: Response
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    throw toNetworkError(err)
  }

  if (!res.ok) {
    let detail = ''
    try {
      const data = (await res.json()) as { error?: { message?: string } }
      detail = data?.error?.message ?? ''
    } catch {
      // non-JSON body — fall back to status line
    }
    const code =
      res.status === 401 || res.status === 403
        ? 'invalid_key'
        : res.status === 429
          ? 'rate_limited'
          : 'provider_error'
    const base =
      code === 'invalid_key'
        ? t('ai.invalidKey', { provider: 'Gemini' })
        : code === 'rate_limited'
          ? t('ai.rateLimited', { provider: 'Gemini' })
          : t('ai.apiError', { provider: 'Gemini', status: String(res.status) })
    throw new AiError(detail ? `${base}: ${detail}` : base, {
      code,
      status: code === 'invalid_key' ? 401 : 502,
    })
  }

  const data = (await res.json().catch(() => null)) as GeminiResponse | null
  const text = data?.candidates
    ?.filter((c) => c.content?.parts && c.content.parts.length > 0)
    .map((c) => c.content?.parts?.map((p) => p.text ?? '').join(''))
    .join('')
    .trim()
  if (!text) {
    throw new AiError(t('ai.emptyResponse', { provider: 'Gemini' }), {
      code: 'empty_response',
    })
  }

  const usage = normalizeUsage({
    prompt: data?.usageMetadata?.promptTokenCount,
    completion: data?.usageMetadata?.candidatesTokenCount,
    total: data?.usageMetadata?.totalTokenCount,
  })
  return { text, usage }
}
