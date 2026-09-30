import { and, eq, inArray } from 'drizzle-orm'

import type { ProviderId } from '@/features/providers/types'
import { fail, ok, type Result } from '@/shared/errors/result'
import { auth } from '@/server/auth'
import { account, member } from '@/server/db/auth-schema'
import { db } from '@/server/db/client'
import type { ID, Nullable } from '@/store/semantic'

export type ProviderToken = {
    userId: ID
    token: string
}

type RepositoryRef = {
    organizationId: ID
    provider: ProviderId
    connectedBy: Nullable<ID>
}

/**
 * @name providerAccounts
 * @description Lists the provider accounts of every member of a workspace for one provider, with the member who
 * connected the repository first.
 *
 * @example
 * const accounts = await providerAccounts(repository)
 */
export async function providerAccounts(repository: RepositoryRef) {
    const members = db
        .select({ userId: member.userId })
        .from(member)
        .where(eq(member.organizationId, repository.organizationId))
    const rows = await db
        .select({ id: account.id, userId: account.userId })
        .from(account)
        .where(and(eq(account.providerId, repository.provider), inArray(account.userId, members)))
    return rows.toSorted(
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
        return ok({ userId, token: result.accessToken })
    } catch (error) {
        return fail('auth_revoked', `token for account ${accountId} failed: ${String(error)}`)
    }
}

/**
 * @name candidateTokens
 * @description Yields valid tokens for a repository in order of preference, skipping accounts whose token can no
 * longer be refreshed. The snapshot provider needs no token and yields one empty token.
 *
 * @example
 * for await (const token of candidateTokens(repository)) { ... }
 */
export async function* candidateTokens(repository: RepositoryRef): AsyncGenerator<ProviderToken> {
    if (repository.provider === 'snapshot') {
        yield { userId: repository.connectedBy ?? '', token: '' }
        return
    }
    for (const row of await providerAccounts(repository)) {
        const token = await accessToken(row.id, row.userId)
        if (token.ok) yield token.value
    }
}

/**
 * @name viewerToken
 * @description Returns a valid token of the viewer's own account for a provider, used to list repositories during
 * onboarding and to reconnect a repository.
 *
 * @example
 * const token = await viewerToken(viewer.id, 'bitbucket')
 */
export async function viewerToken(userId: ID, provider: ProviderId): Promise<Result<ProviderToken>> {
    if (provider === 'snapshot') return ok({ userId, token: '' })
    const [row] = await db
        .select({ id: account.id })
        .from(account)
        .where(and(eq(account.userId, userId), eq(account.providerId, provider)))
    if (!row) return fail('auth_revoked', `user ${userId} has no ${provider} account`, { provider })
    const token = await accessToken(row.id, userId)
    return token.ok ? token : fail('auth_revoked', token.error.detail, { provider })
}
