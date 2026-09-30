import type { GenericOAuthConfig } from 'better-auth/plugins'
import { z } from 'zod'

const API = 'https://api.bitbucket.org/2.0'

const userSchema = z.object({
    uuid: z.string(),
    account_id: z.string().optional(),
    display_name: z.string(),
    links: z.object({ avatar: z.object({ href: z.string() }).optional() }).optional(),
})

const emailsSchema = z.object({
    values: z.array(z.object({ email: z.string(), is_primary: z.boolean(), is_confirmed: z.boolean() })),
})

async function getJson(path: string, token: string) {
    const response = await fetch(`${API}${path}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) return null
    return response.json()
}

/**
 * @name bitbucketOAuth
 * @description Better Auth generic OAuth config for Bitbucket Cloud. Returns an empty list when the consumer key
 * and secret are not set, so the app still boots with email and password only. Reads the primary email and
 * whether Bitbucket confirmed it, which Better Auth stores as `emailVerified`.
 *
 * @example
 * genericOAuth({ config: bitbucketOAuth() })
 */
export function bitbucketOAuth(): GenericOAuthConfig[] {
    const clientId = process.env.BITBUCKET_CLIENT_ID
    const clientSecret = process.env.BITBUCKET_CLIENT_SECRET
    if (!clientId || !clientSecret) return []
    return [
        {
            providerId: 'bitbucket',
            name: 'Bitbucket',
            clientId,
            clientSecret,
            authorizationUrl: 'https://bitbucket.org/site/oauth2/authorize',
            tokenUrl: 'https://bitbucket.org/site/oauth2/access_token',
            scopes: ['account', 'email', 'repository', 'pullrequest'],
            async getUserInfo(tokens) {
                if (!tokens.accessToken) return null
                const profile = userSchema.safeParse(await getJson('/user', tokens.accessToken))
                const emails = emailsSchema.safeParse(await getJson('/user/emails', tokens.accessToken))
                if (!profile.success || !emails.success) return null
                const primary = emails.data.values.find((entry) => entry.is_primary) ?? emails.data.values[0]
                if (!primary) return null
                return {
                    id: profile.data.uuid,
                    name: profile.data.display_name,
                    email: primary.email,
                    emailVerified: primary.is_confirmed,
                    image: profile.data.links?.avatar?.href,
                }
            },
        },
    ]
}
