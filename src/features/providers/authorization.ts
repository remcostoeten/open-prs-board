import type { SyncContext } from '@/features/providers/types'

/**
 * @name authorization
 * @description The `Authorization` header value for a sync context: `Bearer` for OAuth access tokens, `Basic` for
 * an API token whose `token` already holds the base64 `username:secret` pair.
 *
 * @example
 * fetch(url, { headers: { Authorization: authorization(ctx) } })
 */
export function authorization(ctx: Pick<SyncContext, 'token' | 'scheme'>) {
    return ctx.scheme === 'basic' ? `Basic ${ctx.token}` : `Bearer ${ctx.token}`
}

/**
 * @name basicToken
 * @description Encodes a username and secret as the base64 pair that HTTP Basic auth expects.
 *
 * @example
 * basicToken('kim@example.com', 'ATATT3x...') // 'a2ltQGV4YW1wbGUuY29tOkFUQVRUM3guLi4='
 */
export function basicToken(username: string, secret: string) {
    return Buffer.from(`${username}:${secret}`).toString('base64')
}
