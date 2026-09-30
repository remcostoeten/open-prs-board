import type { Result } from '@/shared/errors/result'

type RetryOptions = {
    attempts: number
    baseMs: number
    maxMs: number
    maxWaitMs: number
    deadline: number
}

const DEFAULTS: RetryOptions = { attempts: 4, baseMs: 500, maxMs: 30_000, maxWaitMs: 30_000, deadline: Infinity }

function sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

/**
 * @name backoffDelay
 * @description Full-jitter exponential backoff: a random delay between 0 and `min(maxMs, baseMs * 2^attempt)`.
 *
 * @example
 * backoffDelay(2, 500, 30_000) // somewhere in 0..2000
 */
export function backoffDelay(attempt: number, baseMs: number, maxMs: number) {
    return Math.random() * Math.min(maxMs, baseMs * 2 ** attempt)
}

/**
 * @name withRetry
 * @description Runs a Result-returning task and retries it only while the error is retryable. Waits a full-jitter
 * backoff, or the provider's `retryAfterMs` when given. Gives up and returns the last error when attempts run out,
 * when the wait exceeds `maxWaitMs`, or when the wait would pass `deadline` (epoch ms).
 *
 * @example
 * const result = await withRetry(() => adapter.listPullRequests(ctx), { deadline: startedAt + 50_000 })
 */
export async function withRetry<Value>(task: () => Promise<Result<Value>>, options: Partial<RetryOptions> = {}) {
    const { attempts, baseMs, maxMs, maxWaitMs, deadline } = { ...DEFAULTS, ...options }
    let result = await task()
    for (let attempt = 1; attempt < attempts && !result.ok && result.error.retryable; attempt++) {
        const wait = result.error.retryAfterMs ?? backoffDelay(attempt, baseMs, maxMs)
        if (wait > maxWaitMs || Date.now() + wait > deadline) return result
        await sleep(wait)
        result = await task()
    }
    return result
}
