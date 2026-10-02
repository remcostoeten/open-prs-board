'use server'

import { and, eq } from 'drizzle-orm'
import { refresh } from 'next/cache'

import { apiTokenSchema } from '@/features/credentials/schema'
import { encryptSecret } from '@/features/credentials/secret'
import { verifyApiToken } from '@/features/providers/bitbucket/api-token'
import { toPublicError, type ActionResult } from '@/shared/errors/result'
import { logError } from '@/server/errors/log'
import { withRetry } from '@/server/errors/retry'
import { providerCredentials } from '@/server/db/board-schema'
import { db } from '@/server/db/client'
import { currentActor, denied } from '@/server/guard'

export async function saveBitbucketTokenAction(email: string, token: string): Promise<ActionResult<null>> {
    const actor = await currentActor()
    if (!actor) return denied('forbidden')
    const parsed = apiTokenSchema.safeParse({ email, token })
    if (!parsed.success) return denied('invalid_input', actor.correlationId)

    const identity = await withRetry(() => verifyApiToken(parsed.data.email, parsed.data.token, actor.correlationId), {
        maxWaitMs: 5_000,
    })
    if (!identity.ok) {
        logError(identity.error, 'credentials.verify')
        return { ok: false, error: toPublicError(identity.error) }
    }
    const secret = await encryptSecret(parsed.data.token)
    if (!secret.ok) {
        logError({ ...secret.error, context: { correlationId: actor.correlationId } }, 'credentials.encrypt')
        return { ok: false, error: toPublicError(secret.error) }
    }

    const values = {
        username: parsed.data.email,
        secret: secret.value,
        externalAccountId: identity.value.externalAccountId,
        displayName: identity.value.displayName,
    }
    await db
        .insert(providerCredentials)
        .values({ ...values, userId: actor.viewer.id, provider: 'bitbucket' })
        .onConflictDoUpdate({ target: [providerCredentials.userId, providerCredentials.provider], set: values })
    refresh()
    return { ok: true, value: null }
}

export async function removeBitbucketTokenAction(): Promise<ActionResult<null>> {
    const actor = await currentActor()
    if (!actor) return denied('forbidden')
    await db
        .delete(providerCredentials)
        .where(and(eq(providerCredentials.userId, actor.viewer.id), eq(providerCredentials.provider, 'bitbucket')))
    refresh()
    return { ok: true, value: null }
}
