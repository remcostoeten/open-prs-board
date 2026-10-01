import type { z } from 'zod'

import type { ErrorCode } from '@/shared/errors/codes'
import { fail, ok, type ErrorContext, type Result } from '@/shared/errors/result'
import type { Nullable } from '@/store/semantic'

export const REQUEST_TIMEOUT_MS = 15_000

export type Classifier = (response: Response) => Nullable<ErrorCode>

type RequestOptions = {
    signal: AbortSignal
    context: ErrorContext
    classify: Classifier
    notFound: ErrorCode
    init?: RequestInit
}

/**
 * @name retryAfterMs
 * @description Reads `Retry-After` (seconds or an HTTP date), or else `X-RateLimit-Reset` (epoch seconds), from a
 * response, in milliseconds. Null when neither is present.
 *
 * @example
 * retryAfterMs(response) // 60000
 */
export function retryAfterMs(response: Response) {
    const header = response.headers.get('retry-after')
    const reset = Number(response.headers.get('x-ratelimit-reset'))
    if (!header && reset > 0) return Math.max(0, reset * 1000 - Date.now())
    if (!header) return null
    const seconds = Number(header)
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
    const date = Date.parse(header)
    return Number.isNaN(date) ? null : Math.max(0, date - Date.now())
}

/**
 * @name statusCode
 * @description Maps an HTTP status to an error code when the adapter's own classifier had no opinion.
 *
 * @example
 * statusCode(429, 'not_found') // 'rate_limited'
 */
export function statusCode(status: number, notFound: ErrorCode): ErrorCode {
    if (status === 401) return 'auth_expired'
    if (status === 403) return 'access_lost'
    if (status === 404) return notFound
    if (status === 408) return 'timeout'
    if (status === 429) return 'rate_limited'
    if (status >= 500) return 'provider_unavailable'
    return 'unknown'
}

/**
 * @name normalizeResponse
 * @description Turns a non-ok provider response into a failed Result: the adapter classifier first, then the
 * status table. Keeps the status, the provider request ID and `Retry-After` for logging and retries.
 *
 * @example
 * if (!response.ok) return normalizeResponse(response, options)
 */
export async function normalizeResponse<Value>(
    response: Response,
    options: Omit<RequestOptions, 'signal' | 'init'>,
): Promise<Result<Value>> {
    const code = options.classify(response) ?? statusCode(response.status, options.notFound)
    const body = await response.text().catch(() => '')
    const context = {
        ...options.context,
        status: response.status,
        providerRequestId:
            response.headers.get('x-request-id') ?? response.headers.get('x-github-request-id') ?? undefined,
    }
    return fail(code, `${response.status} ${response.url} ${body.slice(0, 300)}`, context, retryAfterMs(response))
}

/**
 * @name providerFetch
 * @description Fetches a provider URL with a 15 second timeout joined to the caller's abort signal and returns a
 * Result instead of throwing. Timeouts, network failures and non-ok statuses become typed error codes.
 *
 * @example
 * const response = await providerFetch(url, { signal, context, classify, notFound: 'access_lost' })
 */
export async function providerFetch(url: string, options: RequestOptions): Promise<Result<Response>> {
    const signal = AbortSignal.any([options.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
    try {
        const response = await fetch(url, { ...options.init, signal })
        if (response.ok) return ok(response)
        return normalizeResponse(response, options)
    } catch (error) {
        const name = error instanceof Error ? error.name : ''
        if (name === 'TimeoutError' || name === 'AbortError')
            return fail('timeout', `${url} aborted: ${name}`, options.context)
        return fail('provider_unavailable', `${url} failed: ${String(error)}`, options.context)
    }
}

/**
 * @name parseBody
 * @description Parses a provider JSON body against a zod schema. A body that does not match becomes
 * `invalid_response` with the first issue as technical detail.
 *
 * @example
 * const page = await parseBody(response, pageSchema, context)
 */
export async function parseBody<Schema extends z.ZodType>(
    response: Response,
    schema: Schema,
    context: ErrorContext,
): Promise<Result<z.output<Schema>>> {
    const json = await response.json().catch(() => undefined)
    const parsed = schema.safeParse(json)
    if (parsed.success) return ok(parsed.data)
    const issue = parsed.error.issues[0]
    return fail('invalid_response', `${response.url}: ${issue?.path.join('.')} ${issue?.message}`, context)
}
