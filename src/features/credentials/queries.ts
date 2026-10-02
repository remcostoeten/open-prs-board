import { and, eq } from 'drizzle-orm'

import type { ProviderId } from '@/features/providers/types'
import { providerCredentials } from '@/server/db/board-schema'
import { db } from '@/server/db/client'
import type { ID } from '@/store/semantic'

/**
 * @name loadCredential
 * @description The viewer's stored API token credential for a provider, without the secret. Null when there is none.
 *
 * @example
 * const credential = await loadCredential(viewer.id, 'bitbucket')
 */
export async function loadCredential(userId: ID, provider: ProviderId) {
    const [row] = await db
        .select({
            username: providerCredentials.username,
            displayName: providerCredentials.displayName,
            updatedAt: providerCredentials.updatedAt,
        })
        .from(providerCredentials)
        .where(and(eq(providerCredentials.userId, userId), eq(providerCredentials.provider, provider)))
    return row ?? null
}
