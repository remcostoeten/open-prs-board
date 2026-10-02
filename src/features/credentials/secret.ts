import { symmetricDecrypt, symmetricEncrypt } from 'better-auth/crypto'

import { fail, ok, type Result } from '@/shared/errors/result'

function key(): Result<string> {
    const secret = process.env.BETTER_AUTH_SECRET
    return secret ? ok(secret) : fail('unknown', 'BETTER_AUTH_SECRET is not set, credentials cannot be encrypted')
}

/**
 * @name encryptSecret
 * @description Encrypts a provider secret with `BETTER_AUTH_SECRET`, the same key Better Auth uses for OAuth tokens.
 *
 * @example
 * const stored = await encryptSecret(apiToken)
 */
export async function encryptSecret(value: string): Promise<Result<string>> {
    const secret = key()
    if (!secret.ok) return secret
    return ok(await symmetricEncrypt({ key: secret.value, data: value }))
}

/**
 * @name decryptSecret
 * @description Decrypts a secret stored by `encryptSecret`. A changed `BETTER_AUTH_SECRET` or a damaged value
 * becomes `auth_revoked`, so the owner is asked to enter the token again.
 *
 * @example
 * const token = await decryptSecret(row.secret)
 */
export async function decryptSecret(value: string): Promise<Result<string>> {
    const secret = key()
    if (!secret.ok) return secret
    try {
        return ok(await symmetricDecrypt({ key: secret.value, data: value }))
    } catch (error) {
        return fail('auth_revoked', `stored credential could not be decrypted: ${String(error)}`)
    }
}
