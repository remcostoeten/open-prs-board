import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { nextCookies } from 'better-auth/next-js'
import { genericOAuth, organization } from 'better-auth/plugins'

import { bitbucketOAuth } from '@/features/providers/bitbucket/oauth'
import { noop } from '@/shared/helpers/noop'
import * as authSchema from '@/server/db/auth-schema'
import { db } from '@/server/db/client'

const INVITATION_TTL_SECONDS = 60 * 60 * 24 * 7

function socialProviders() {
    const github =
        process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
            ? {
                  github: {
                      clientId: process.env.GITHUB_CLIENT_ID,
                      clientSecret: process.env.GITHUB_CLIENT_SECRET,
                      scope: ['read:user', 'user:email', 'repo'],
                  },
              }
            : {}
    return github
}

export const auth = betterAuth({
    appName: 'PR board',
    baseURL: process.env.BETTER_AUTH_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: 'sqlite', schema: authSchema }),
    emailAndPassword: { enabled: true, minPasswordLength: 10 },
    socialProviders: socialProviders(),
    account: {
        encryptOAuthTokens: true,
        accountLinking: { enabled: true, trustedProviders: ['bitbucket', 'github'] },
    },
    plugins: [
        genericOAuth({ config: bitbucketOAuth() }),
        organization({
            allowUserToCreateOrganization: true,
            creatorRole: 'owner',
            invitationExpiresIn: INVITATION_TTL_SECONDS,
            cancelPendingInvitationsOnReInvite: true,
            requireEmailVerificationOnInvitation: true,
            sendInvitationEmail: async () => noop(),
        }),
        nextCookies(),
    ],
})

export type Session = typeof auth.$Infer.Session

/**
 * @name configuredProviders
 * @description The OAuth providers whose client id and secret are set, in display order.
 *
 * @example
 * configuredProviders() // ['bitbucket']
 */
export function configuredProviders() {
    const list: ('bitbucket' | 'github')[] = []
    if (process.env.BITBUCKET_CLIENT_ID && process.env.BITBUCKET_CLIENT_SECRET) list.push('bitbucket')
    if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) list.push('github')
    return list
}
