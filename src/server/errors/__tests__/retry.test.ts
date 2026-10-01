import { describe, expect, test } from 'bun:test'

import { fail, ok, type Result } from '@/shared/errors/result'
import { backoffDelay, withRetry } from '@/server/errors/retry'

function sequence(results: Result<string>[]) {
    let calls = 0
    function task() {
        const result = results[Math.min(calls, results.length - 1)]
        calls++
        return Promise.resolve(result ?? ok('done'))
    }
    return { task, calls: () => calls }
}

describe('withRetry', () => {
    test('retries retryable errors until success', async () => {
        const run = sequence([fail('timeout', 't'), fail('provider_unavailable', 'p'), ok('done')])
        const result = await withRetry(run.task, { baseMs: 1, maxMs: 2 })
        expect(result.ok && result.value).toBe('done')
        expect(run.calls()).toBe(3)
    })

    test('never retries terminal errors', async () => {
        const run = sequence([fail('access_lost', 'gone'), ok('done')])
        const result = await withRetry(run.task, { baseMs: 1 })
        expect(!result.ok && result.error.code).toBe('access_lost')
        expect(run.calls()).toBe(1)
    })

    test('gives up when the provider asks to wait longer than allowed', async () => {
        const run = sequence([fail('rate_limited', 'slow', {}, 120_000), ok('done')])
        const result = await withRetry(run.task, { maxWaitMs: 30_000 })
        expect(!result.ok && result.error.code).toBe('rate_limited')
        expect(run.calls()).toBe(1)
    })

    test('stops at the deadline', async () => {
        const run = sequence([fail('timeout', 't'), ok('done')])
        const result = await withRetry(run.task, { baseMs: 10_000, maxMs: 10_000, deadline: Date.now() })
        expect(result.ok).toBe(false)
        expect(run.calls()).toBe(1)
    })
})

describe('backoffDelay', () => {
    test('stays within the full-jitter window', () => {
        for (let attempt = 0; attempt < 8; attempt++) {
            const delay = backoffDelay(attempt, 500, 30_000)
            expect(delay).toBeGreaterThanOrEqual(0)
            expect(delay).toBeLessThanOrEqual(Math.min(30_000, 500 * 2 ** attempt))
        }
    })
})
