import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { generateGemini } from './gemini'
import { AiError } from '../types'

function providerArgs(overrides: Partial<import('./shared').ProviderArgs> = {}) {
  return {
    apiKey: 'AIza-test',
    model: 'gemini-3.5-flash',
    systemPrompt: 'You are a test assistant.',
    messages: [
      { role: 'user' as const, content: 'Hello' },
      { role: 'assistant' as const, content: 'Hi!' },
      { role: 'user' as const, content: 'How are you?' },
    ],
    timeoutMs: 30_000,
    baseUrl: null,
    ...overrides,
  }
}

function okResponse(json: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => json,
  } as unknown as Response
}

function errResponse(status: number, json: unknown): Response {
  return {
    ok: false,
    status,
    json: async () => json,
  } as unknown as Response
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})
afterEach(() => vi.unstubAllGlobals())

describe('generateGemini', () => {
  it('builds the correct URL with the model id and :generateContent suffix', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okResponse({
        candidates: [{ content: { parts: [{ text: 'Great!' }] } }],
        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 3, totalTokenCount: 8 },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await generateGemini(providerArgs())

    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent',
    )
    expect(opts.headers['x-goog-api-key']).toBe('AIza-test')
  })

  it('maps assistant → model and user → user in contents', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okResponse({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await generateGemini(providerArgs())

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.contents[0].role).toBe('user')
    expect(body.contents[0].parts).toEqual([{ text: 'Hello' }])
    expect(body.contents[1].role).toBe('model')
    expect(body.contents[1].parts).toEqual([{ text: 'Hi!' }])
    expect(body.contents[2].role).toBe('user')
    expect(body.contents[2].parts).toEqual([{ text: 'How are you?' }])
  })

  it('omits systemInstruction when systemPrompt is empty', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okResponse({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await generateGemini(providerArgs({ systemPrompt: '' }))

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body).not.toHaveProperty('systemInstruction')
  })

  it('includes systemInstruction when systemPrompt is set', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okResponse({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await generateGemini(providerArgs())

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'You are a test assistant.' }] })
    expect(body.generationConfig.maxOutputTokens).toBe(1024)
  })

  it('normalizes usage from usageMetadata fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        okResponse({
          candidates: [{ content: { parts: [{ text: 'reply' }] } }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
        }),
      ),
    )

    const res = await generateGemini(providerArgs())
    expect(res.usage).toEqual({ promptTokens: 10, completionTokens: 5, totalTokens: 15 })
  })

  it('returns null usage when usageMetadata is absent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        okResponse({ candidates: [{ content: { parts: [{ text: 'reply' }] } }] }),
      ),
    )

    const res = await generateGemini(providerArgs())
    expect(res.text).toBe('reply')
    expect(res.usage).toBeNull()
  })

  it('maps 401 to an invalid_key AiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        errResponse(401, { error: { message: 'API key not valid.' } }),
      ),
    )

    await expect(generateGemini(providerArgs())).rejects.toMatchObject({
      code: 'invalid_key',
      status: 401,
    })
  })

  it('maps 429 to a rate_limited AiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(errResponse(429, { error: { message: 'Rate limit exceeded' } })),
    )

    await expect(generateGemini(providerArgs())).rejects.toMatchObject({
      code: 'rate_limited',
      status: 502,
    })
  })

  it('maps 404 to a provider_error AiError with the model message', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          errResponse(404, {
            error: { message: 'This model is no longer available.' },
          }),
        ),
    )

    await expect(generateGemini(providerArgs())).rejects.toMatchObject({
      code: 'provider_error',
      status: 502,
    })
  })

  it('throws an AiError when all candidates have empty parts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        okResponse({ candidates: [{ content: { parts: [] } }] }),
      ),
    )

    await expect(generateGemini(providerArgs())).rejects.toMatchObject({
      code: 'empty_response',
    })
  })

  it('throws on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))

    await expect(generateGemini(providerArgs())).rejects.toBeInstanceOf(AiError)
  })
})
