import { afterEach, describe, expect, test } from 'bun:test'
import { createHmac } from 'node:crypto'

import { bitbucket } from '@/features/providers/bitbucket/adapter'
import type { SyncContext } from '@/features/providers/types'

const realFetch = globalThis.fetch

type Handler = (url: string) => Response | Promise<Response>

function stubFetch(handler: Handler) {
    const calls: string[] = []
    globalThis.fetch = Object.assign(
        async (input: string | URL | Request) => {
            const url = input instanceof Request ? input.url : String(input)
            calls.push(url)
            return handler(url)
        },
        { preconnect: () => undefined },
    )
    return calls
}

function ctx(): SyncContext {
    return {
        correlationId: 'test-correlation',
        token: 'secret-token',
        repository: { slug: 'acme/web', externalId: '{uuid}' },
        signal: new AbortController().signal,
    }
}

function json(body: Record<string, unknown> | unknown[], init: ResponseInit = {}) {
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init })
}

afterEach(() => {
    globalThis.fetch = realFetch
})

describe('bitbucket adapter errors', () => {
    test('429 becomes rate_limited with the Retry-After delay', async () => {
        stubFetch(() => new Response('slow down', { status: 429, headers: { 'retry-after': '60' } }))
        const result = await bitbucket.listPullRequests(ctx())
        expect(result.ok).toBe(false)
        if (result.ok) return
        expect(result.error.code).toBe('rate_limited')
        expect(result.error.retryable).toBe(true)
        expect(result.error.retryAfterMs).toBe(60_000)
    })

    test('401 is an expired token and 403 on a repository is lost access', async () => {
        stubFetch(() => new Response('', { status: 401 }))
        const expired = await bitbucket.listPullRequests(ctx())
        expect(!expired.ok && expired.error.code).toBe('auth_expired')
        stubFetch(() => new Response('', { status: 403 }))
        const lost = await bitbucket.listPullRequests(ctx())
        expect(!lost.ok && lost.error.code).toBe('access_lost')
        expect(!lost.ok && lost.error.recovery).toBe('reconnect_repository')
    })

    test('a 404 on one pull request is not_found, not lost access', async () => {
        stubFetch(() => new Response('', { status: 404 }))
        const result = await bitbucket.getPullRequest(ctx(), '7')
        expect(!result.ok && result.error.code).toBe('not_found')
    })

    test('5xx is provider_unavailable and retryable', async () => {
        stubFetch(() => new Response('', { status: 502 }))
        const result = await bitbucket.listPullRequests(ctx())
        expect(!result.ok && result.error.code).toBe('provider_unavailable')
        expect(!result.ok && result.error.retryable).toBe(true)
    })

    test('an aborted request is a timeout', async () => {
        stubFetch(() => {
            throw new DOMException('timed out', 'TimeoutError')
        })
        const result = await bitbucket.listPullRequests(ctx())
        expect(!result.ok && result.error.code).toBe('timeout')
    })

    test('a body that does not match the schema is invalid_response', async () => {
        stubFetch(() => json({ values: [{ id: 'not a number' }] }))
        const result = await bitbucket.listPullRequests(ctx())
        expect(!result.ok && result.error.code).toBe('invalid_response')
    })

    test('technical detail never leaks the token', async () => {
        stubFetch(() => new Response('Authorization: Bearer secret-token', { status: 500 }))
        const result = await bitbucket.listPullRequests(ctx())
        expect(!result.ok && result.error.detail.includes('secret-token')).toBe(true)
        const { redact } = await import('@/server/errors/log')
        expect(!result.ok && redact(result.error.detail).includes('secret-token')).toBe(false)
    })
})

function repo(n: number) {
    return {
        uuid: `{${n}}`,
        full_name: `acme/r${n}`,
        name: `r${n}`,
        links: { html: { href: `https://bitbucket.org/acme/r${n}` } },
    }
}

describe('bitbucket adapter pagination and diffs', () => {
    test('follows next links across pages', async () => {
        const calls = stubFetch((url) =>
            url.includes('page=2')
                ? json({ values: [repo(2)] })
                : json({ values: [repo(1)], next: 'https://api.bitbucket.org/2.0/repositories?page=2' }),
        )
        const result = await bitbucket.listRepositories(ctx())
        expect(result.ok && result.value.map((entry) => entry.slug)).toEqual(['acme/r1', 'acme/r2'])
        expect(calls.length).toBe(2)
    })

    test('a diff without file headers is invalid_diff', async () => {
        stubFetch(() => new Response('this is not a diff'))
        const result = await bitbucket.getDiff(ctx(), '7', null)
        expect(!result.ok && result.error.code).toBe('invalid_diff')
    })
})

describe('bitbucket webhooks', () => {
    const body = JSON.stringify({ repository: { uuid: '{uuid}' }, pullrequest: { id: 7 } })

    test('accepts a correctly signed delivery', async () => {
        const signature = `sha256=${createHmac('sha256', 'hook-secret').update(body).digest('hex')}`
        const request = new Request('https://board/api/webhooks/bitbucket', {
            method: 'POST',
            body,
            headers: { 'x-hub-signature': signature, 'x-request-uuid': 'd1' },
        })
        const result = await bitbucket.parseWebhook(request, 'hook-secret')
        expect(result.ok && result.value).toEqual({
            repositoryExternalId: '{uuid}',
            pullRequestExternalId: '7',
            deliveryId: 'd1',
        })
    })

    test('rejects a wrong signature', async () => {
        const request = new Request('https://board/api/webhooks/bitbucket', {
            method: 'POST',
            body,
            headers: { 'x-hub-signature': 'sha256=00' },
        })
        const result = await bitbucket.parseWebhook(request, 'hook-secret')
        expect(!result.ok && result.error.code).toBe('webhook_invalid')
    })
})

describe('redact', () => {
    test('masks bearer tokens and keyed secrets', async () => {
        const { redact } = await import('@/server/errors/log')
        expect(redact('Authorization: Bearer abc.def')).toBe('Authorization: Bearer [redacted]')
        expect(redact('{"access_token":"xyz","refresh_token": "q"}')).toBe(
            '{"access_token":"[redacted]","refresh_token": "[redacted]"}',
        )
        expect(redact('client_secret=s3cr3t&code=1')).toBe('client_secret=[redacted]&code=1')
    })
})
