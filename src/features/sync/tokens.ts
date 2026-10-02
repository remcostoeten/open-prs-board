import { and, eq, inArray } from 'drizzle-orm'

import { decryptSecret } from '@/features/credentials/secret'
import { basicToken } from '@/features/providers/authorization'
import type { AuthScheme, ProviderId } from '@/features/providers/types'
import { fail, ok, type Result } from '@/shared/errors/result'
import { auth } from '@/server/auth'
import { account, member } from '@/server/db/auth-schema'
import { providerCredentials } from '@/server/db/board-schema'
import { db } from '@/server/db/client'
import type { ID, Nullable } from '@/store/semantic'

export type ProviderToken = {
    userId: ID
    token: string
    scheme: AuthScheme
}

type StoredCredential = {
    userId: ID
    username: string
    secret: string
}

type TokenSource = {
    userId: ID
    load: () => Promise<Result<ProviderToken>>
}

type RepositoryRef = {
    organizationId: ID
    provider: ProviderId
    connectedBy: Nullable<ID>
}

/**
 * @name credentialToken
 * @description Decrypts a stored API token credential into a Basic auth token.
 *
 * @example
 * const token = await credentialToken(row)
 */
export async function credentialToken(row: StoredCredential) {
    const secret = await decryptSecret(row.secret)
    if (!secret.ok) return secret
    return ok<ProviderToken>({ userId: row.userId, token: basicToken(row.username, secret.value), scheme: 'basic' })
}

/**
 * @name tokenSources
 * @description Lists every way to get a token for a repository's provider from the members of its workspace: their
 * OAuth accounts first, then their API token credentials. The member who connected the repository comes first.
 *
 * @example
 * const sources = await tokenSources(repository)
 */
export async function tokenSources(repository: RepositoryRef): Promise<TokenSource[]> {
    const members = db
        .select({ userId: member.userId })
        .from(member)
        .where(eq(member.organizationId, repository.organizationId))
    const [accounts, credentials] = await Promise.all([
        db
            .select({ id: account.id, userId: account.userId })
            .from(account)
            .where(and(eq(account.providerId, repository.provider), inArray(account.userId, members))),
        db
            .select({
                userId: providerCredentials.userId,
                username: providerCredentials.username,
                secret: providerCredentials.secret,
            })
            .from(providerCredentials)
            .where(
                and(
                    eq(providerCredentials.provider, repository.provider),
                    inArray(providerCredentials.userId, members),
                ),
            ),
    ])
    const sources: TokenSource[] = [
        ...accounts.map((row) => ({ userId: row.userId, load: () => accessToken(row.id, row.userId) })),
        ...credentials.map((row) => ({ userId: row.userId, load: () => credentialToken(row) })),
    ]
    return sources.toSorted(
        (a, b) => Number(b.userId === repository.connectedBy) - Number(a.userId === repository.connectedBy),
    )
}

/**
 * @name accessToken
 * @description Gets a valid access token for one Better Auth account, refreshing it when it expired. A failed
 * refresh or a missing token becomes `auth_revoked`.
 *
 * @example
 * const token = await accessToken(row.id, row.userId)
 */
export async function accessToken(accountId: ID, userId: ID): Promise<Result<ProviderToken>> {
    try {
        const result = await auth.api.getAccessToken({ body: { accountId, userId } })
        if (!result.accessToken) return fail('auth_revoked', `account ${accountId} has no access token`)
        return ok({ userId, token: result.accessToken, scheme: 'bearer' })
    } catch (error) {
        return fail('auth_revoked', `token for account ${accountId} failed: ${String(error)}`)
    }
}

/**
 * @name candidateTokens
 * @description Yields valid tokens for a repository in order of preference, skipping accounts whose token can no
 * longer be refreshed or decrypted. The snapshot provider needs no token and yields one empty token.
 *
 * @example
 * for await (const token of candidateTokens(repository)) { ... }
 */
export async function* candidateTokens(repository: RepositoryRef): AsyncGenerator<ProviderToken> {
    if (repository.provider === 'snapshot') {
        yield { userId: repository.connectedBy ?? '', token: '', scheme: 'bearer' }
        return
    }
    for (const source of await tokenSources(repository)) {
        const token = await source.load()
        if (token.ok) yield token.value
    }
}

/**
 * @name viewerToken
 * @description Returns a valid token of the viewer's own OAuth account or API token for a provider, used to list repositories during
 * onboarding and to reconnect a repository.
 *
 * @example
 * const token = await viewerToken(viewer.id, 'bitbucket')
 */
export async function viewerToken(userId: ID, provider: ProviderId): Promise<Result<ProviderToken>> {
    if (provider === 'snapshot') return ok({ userId, token: '', scheme: 'bearer' })
    const [[row], [credential]] = await Promise.all([
        db
            .select({ id: account.id })
            .from(account)
            .where(and(eq(account.userId, userId), eq(account.providerId, provider))),
        db
            .select({
                userId: providerCredentials.userId,
                username: providerCredentials.username,
                secret: providerCredentials.secret,
            })
            .from(providerCredentials)
            .where(and(eq(providerCredentials.userId, userId), eq(providerCredentials.provider, provider))),
    ])
    const token = row ? await accessToken(row.id, userId) : null
    if (token?.ok) return token
    if (credential) {
        const fromCredential = await credentialToken(credential)
        if (fromCredential.ok) return fromCredential
    }
    if (!token) return fail('auth_revoked', `user ${userId} has no ${provider} account or API token`, { provider })
    return fail('auth_revoked', token.error.detail, { provider })
}
