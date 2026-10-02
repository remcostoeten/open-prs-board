import { afterEach, beforeAll, describe, expect, test } from 'bun:test'

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://board:board@localhost:5435/board_test'
process.env.BETTER_AUTH_SECRET ??= 'test-secret-that-is-long-enough-for-encryption'

const { migrate } = await import('drizzle-orm/postgres-js/migrator')
const { sql } = await import('drizzle-orm')
const { db } = await import('@/server/db/client')
const { member, organization, user } = await import('@/server/db/auth-schema')
const { providerCredentials } = await import('@/server/db/board-schema')
const { decryptSecret, encryptSecret } = await import('@/features/credentials/secret')
const { verifyApiToken } = await import('@/features/providers/bitbucket/api-token')
const { authorization, basicToken } = await import('@/features/providers/authorization')
const { candidateTokens, viewerToken } = await import('@/features/sync/tokens')

const realFetch = globalThis.fetch
const EMAIL = 'kim@example.com'
const TOKEN = 'ATATT3xFfGF0-example-api-token'

type Seen = {
    url: string
    authorization: string | null
}

function stubFetch(response: () => Response) {
    const seen: Seen[] = []
    globalThis.fetch = Object.assign(
        async (input: string | URL | Request, init?: RequestInit) => {
            seen.push({ url: String(input), authorization: new Headers(init?.headers).get('authorization') })
            return response()
        },
        { preconnect: () => undefined },
    )
    return seen
}

let organizationId = ''
let userId = ''

beforeAll(async () => {
    await db.execute(sql`drop schema if exists drizzle cascade`)
    await db.execute(sql`drop schema public cascade`)
    await db.execute(sql`create schema public`)
    await migrate(db, { migrationsFolder: 'drizzle' })
    organizationId = crypto.randomUUID()
    userId = crypto.randomUUID()
    const now = new Date()
    await db.insert(organization).values({ id: organizationId, name: 'Test', slug: 'test', createdAt: now })
    await db
        .insert(user)
        .values({ id: userId, name: 'Kim', email: EMAIL, emailVerified: true, createdAt: now, updatedAt: now })
    await db.insert(member).values({ id: crypto.randomUUID(), organizationId, userId, role: 'member', createdAt: now })
})

afterEach(() => {
    globalThis.fetch = realFetch
})

describe('bitbucket api token', () => {
    test('sends the email and token as Basic auth and returns the account', async () => {
        const seen = stubFetch(() => Response.json({ uuid: '{kim}', display_name: 'Kim de Boer' }))
        const result = await verifyApiToken(EMAIL, TOKEN, 'test')
        expect(result.ok && result.value).toEqual({ externalAccountId: '{kim}', displayName: 'Kim de Boer' })
        expect(seen[0]?.url).toBe('https://api.bitbucket.org/2.0/user')
        expect(seen[0]?.authorization).toBe(`Basic ${btoa(`${EMAIL}:${TOKEN}`)}`)
    })

    test('a rejected token is invalid_credentials and not retried', async () => {
        stubFetch(() => new Response('', { status: 401 }))
        const result = await verifyApiToken(EMAIL, 'wrong', 'test')
        expect(!result.ok && result.error.code).toBe('invalid_credentials')
        expect(!result.ok && result.error.retryable).toBe(false)
    })

    test('the authorization header follows the scheme', () => {
        expect(authorization({ token: 'abc', scheme: 'bearer' })).toBe('Bearer abc')
        expect(authorization({ token: basicToken('a', 'b'), scheme: 'basic' })).toBe(`Basic ${btoa('a:b')}`)
    })
})

describe('stored credentials', () => {
    test('a secret survives encryption and is not stored in plain text', async () => {
        const encrypted = await encryptSecret(TOKEN)
        expect(encrypted.ok && encrypted.value).not.toContain(TOKEN)
        if (!encrypted.ok) return
        const decrypted = await decryptSecret(encrypted.value)
        expect(decrypted.ok && decrypted.value).toBe(TOKEN)
    })

    test('a damaged secret becomes auth_revoked', async () => {
        const result = await decryptSecret('not-a-real-ciphertext')
        expect(!result.ok && result.error.code).toBe('auth_revoked')
    })

    test('sync and onboarding use a member token as Basic auth', async () => {
        const encrypted = await encryptSecret(TOKEN)
        if (!encrypted.ok) throw new Error('encryption failed')
        await db.insert(providerCredentials).values({
            userId,
            provider: 'bitbucket',
            username: EMAIL,
            secret: encrypted.value,
            externalAccountId: '{kim}',
            displayName: 'Kim de Boer',
        })

        const tokens = []
        for await (const token of candidateTokens({ organizationId, provider: 'bitbucket', connectedBy: null })) {
            tokens.push(token)
        }
        expect(tokens).toEqual([{ userId, token: basicToken(EMAIL, TOKEN), scheme: 'basic' }])

        const own = await viewerToken(userId, 'bitbucket')
        expect(own.ok && own.value.scheme).toBe('basic')
        const github = await viewerToken(userId, 'github')
        expect(!github.ok && github.error.code).toBe('auth_revoked')
    })
})
