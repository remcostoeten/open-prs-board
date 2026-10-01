import { createHmac } from 'node:crypto'

import { afterEach, describe, expect, test } from 'bun:test'

import { github } from '@/features/providers/github/adapter'
import type { SyncContext } from '@/features/providers/types'

type Handler = (url: string, init?: RequestInit) => Response

const realFetch = globalThis.fetch

function stubFetch(handler: Handler) {
    const calls: string[] = []
    globalThis.fetch = Object.assign(
        async (input: string | URL | Request, init?: RequestInit) => {
            const url = input instanceof Request ? input.url : String(input)
            calls.push(url)
            return handler(url, init)
        },
        { preconnect: () => undefined },
    )
    return calls
}

function ctx(): SyncContext {
    return {
        correlationId: 'test-correlation',
        token: 'secret-token',
        repository: { slug: 'acme/web', externalId: '42' },
        signal: new AbortController().signal,
    }
}

function json(body: Record<string, unknown> | unknown[], init: ResponseInit = {}) {
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init })
}

function pr(number: number, extra: Record<string, unknown> = {}) {
    return {
        id: number * 10,
        number,
        title: `PR ${number}`,
        html_url: `https://github.com/acme/web/pull/${number}`,
        state: 'open',
        user: { login: 'remco' },
        head: { ref: `feature-${number}`, sha: `sha${number}` },
        base: { ref: 'main' },
        requested_reviewers: [{ login: 'daan' }],
        created_at: '2026-09-01T10:00:00Z',
        updated_at: '2026-09-20T10:00:00Z',
        ...extra,
    }
}

afterEach(() => {
    globalThis.fetch = realFetch
})

describe('github adapter', () => {
    test('follows Link headers when listing open pull requests', async () => {
        const calls = stubFetch((url) =>
            url.includes('page=2')
                ? json([pr(2)])
                : json([pr(1)], {
                      headers: { link: '<https://api.github.com/repos/acme/web/pulls?state=open&page=2>; rel="next"' },
                  }),
        )
        const result = await github.listPullRequests(ctx())
        expect(result.ok && result.value.map((item) => item.number)).toEqual([1, 2])
        expect(calls).toHaveLength(2)
    })

    test('treats a 403 with no remaining quota as a rate limit, not lost access', async () => {
        stubFetch(
            () =>
                new Response('limit', { status: 403, headers: { 'x-ratelimit-remaining': '0', 'retry-after': '30' } }),
        )
        const result = await github.listPullRequests(ctx())
        expect(result.ok).toBe(false)
        if (!result.ok) {
            expect(result.error.code).toBe('rate_limited')
            expect(result.error.retryAfterMs).toBe(30_000)
        }
    })

    test('maps a plain 403 to lost access', async () => {
        stubFetch(() => new Response('nope', { status: 403 }))
        const result = await github.listPullRequests(ctx())
        expect(!result.ok && result.error.code).toBe('access_lost')
    })

    test('keeps only closed pull requests updated after the cutoff', async () => {
        stubFetch(() =>
            json([
                pr(5, { state: 'closed', merged_at: '2026-09-25T10:00:00Z', updated_at: '2026-09-25T10:00:00Z' }),
                pr(4, { state: 'closed', closed_at: '2026-08-01T10:00:00Z', updated_at: '2026-08-01T10:00:00Z' }),
            ]),
        )
        const result = await github.listClosedPullRequests(ctx(), '2026-09-01T00:00:00Z')
        expect(result.ok && result.value.map((item) => [item.number, item.state])).toEqual([[5, 'merged']])
    })

    test('enriches a pull request with line counts, review verdicts and checks', async () => {
        stubFetch((url) => {
            if (url.endsWith('/pulls/7')) return json(pr(7, { additions: 12, deletions: 3, changed_files: 2 }))
            if (url.includes('/reviews'))
                return json([
                    { user: { login: 'daan' }, state: 'CHANGES_REQUESTED', submitted_at: '2026-09-21T10:00:00Z' },
                ])
            return json({ check_runs: [{ status: 'completed', conclusion: 'success' }] })
        })
        const base = await github.getPullRequest(ctx(), '7')
        if (!base.ok) throw new Error('fixture failed')
        const result = await github.enrichPullRequest(ctx(), { ...base.value, additions: null })
        expect(
            result.ok && [result.value.additions, result.value.files, result.value.pipeline, result.value.reviewers],
        ).toEqual([12, 2, 'passed', [{ name: 'daan', state: 'changes_requested' }]])
    })

    test('groups review replies under their root and keeps issue comments as general threads', async () => {
        stubFetch((url) =>
            url.includes('/pulls/')
                ? json([
                      {
                          id: 1,
                          body: 'Rename this',
                          user: { login: 'daan' },
                          path: 'a.ts',
                          line: 4,
                          created_at: '2026-09-21T10:00:00Z',
                          html_url: 'u1',
                      },
                      {
                          id: 2,
                          body: 'Done',
                          user: { login: 'remco' },
                          path: 'a.ts',
                          line: 4,
                          in_reply_to_id: 1,
                          created_at: '2026-09-21T11:00:00Z',
                          html_url: 'u2',
                      },
                  ])
                : json([
                      {
                          id: 9,
                          body: 'Looks good overall',
                          user: { login: 'daan' },
                          created_at: '2026-09-21T12:00:00Z',
                          html_url: 'u9',
                      },
                  ]),
        )
        const result = await github.listThreads(ctx(), '7')
        expect(result.ok && result.value.map((thread) => [thread.path, thread.comments.length])).toEqual([
            ['a.ts', 2],
            [null, 1],
        ])
    })

    test('verifies the webhook signature', async () => {
        const body = JSON.stringify({ repository: { id: 42 }, pull_request: { number: 7 } })
        const signature = `sha256=${createHmac('sha256', 'hook-secret').update(body).digest('hex')}`
        const good = await github.parseWebhook(
            new Request('https://x', { method: 'POST', body, headers: { 'x-hub-signature-256': signature } }),
            'hook-secret',
        )
        expect(good.ok && good.value).toEqual({
            repositoryExternalId: '42',
            pullRequestExternalId: '7',
            deliveryId: null,
        })
        const bad = await github.parseWebhook(
            new Request('https://x', { method: 'POST', body, headers: { 'x-hub-signature-256': 'sha256=00' } }),
            'hook-secret',
        )
        expect(!bad.ok && bad.error.code).toBe('webhook_invalid')
    })
})
