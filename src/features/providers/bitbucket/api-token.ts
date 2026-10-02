import { authorization, basicToken } from '@/features/providers/authorization'
import { userSchema } from '@/features/providers/bitbucket/schema'
import type { ErrorCode } from '@/shared/errors/codes'
import { ok, type ErrorContext, type Result } from '@/shared/errors/result'
import { parseBody, providerFetch } from '@/server/errors/normalize'
import type { ID } from '@/store/semantic'

const USER_URL = 'https://api.bitbucket.org/2.0/user'

export type BitbucketIdentity = {
    externalAccountId: string
    displayName: string
}

function classify(response: Response): ErrorCode | null {
    if (response.status === 401 || response.status === 403) return 'invalid_credentials'
    if (response.status === 429) return 'rate_limited'
    return null
}

/**
 * @name verifyApiToken
 * @description Checks an Atlassian account email and API token against Bitbucket's `/user` endpoint and returns
 * the Bitbucket account behind them. A rejected pair becomes `invalid_credentials`.
 *
 * @example
 * const identity = await verifyApiToken('kim@example.com', token, correlationId)
 */
export async function verifyApiToken(
    email: string,
    token: string,
    correlationId: ID,
): Promise<Result<BitbucketIdentity>> {
    const context: ErrorContext = { correlationId, provider: 'bitbucket' }
    const response = await providerFetch(USER_URL, {
        signal: AbortSignal.timeout(15_000),
        context,
        classify,
        notFound: 'invalid_credentials',
        init: {
            headers: {
                Authorization: authorization({ token: basicToken(email, token), scheme: 'basic' }),
                Accept: 'application/json',
            },
        },
    })
    if (!response.ok) return response
    const profile = await parseBody(response.value, userSchema, context)
    if (!profile.ok) return profile
    return ok({ externalAccountId: profile.value.uuid, displayName: profile.value.display_name })
}
