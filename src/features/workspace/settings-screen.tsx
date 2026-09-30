import { and, desc, eq, gt } from 'drizzle-orm'
import Link from 'next/link'

import { linkProviderAction } from '@/features/auth/actions'
import { PROVIDER_LABEL } from '@/features/board/copy'
import { formatDateTime } from '@/features/board/format'
import { loadMembers, loadRepositories } from '@/features/board/queries'
import { loadNotifications } from '@/features/notifications/queries'
import { AppHeader } from '@/features/shell/app-header'
import { RepositoryRow } from '@/features/workspace/repository-row'
import { InvitePanel } from '@/features/workspace/invite-panel'
import { SyncPanel } from '@/features/sync/components/sync-panel'
import { configuredProviders } from '@/server/auth'
import { account, invitation } from '@/server/db/auth-schema'
import { repositories } from '@/server/db/board-schema'
import { db } from '@/server/db/client'
import { isManager, requireWorkspace } from '@/server/session'

function pendingInvitations(organizationId: string) {
    return db
        .select()
        .from(invitation)
        .where(
            and(
                eq(invitation.organizationId, organizationId),
                eq(invitation.status, 'pending'),
                gt(invitation.expiresAt, new Date()),
            ),
        )
        .orderBy(desc(invitation.createdAt))
}

export async function SettingsScreen() {
    const { viewer, workspace } = await requireWorkspace('/settings')
    const manager = isManager(workspace.role)
    const [members, repos, notifications, accounts, invitations, secrets] = await Promise.all([
        loadMembers(workspace.id),
        loadRepositories(workspace.id, workspace.role),
        loadNotifications(viewer.id, workspace.id),
        db.select({ provider: account.providerId }).from(account).where(eq(account.userId, viewer.id)),
        manager ? pendingInvitations(workspace.id) : Promise.resolve([]),
        manager
            ? db
                  .select({ id: repositories.id, secret: repositories.webhookSecret })
                  .from(repositories)
                  .where(eq(repositories.organizationId, workspace.id))
            : Promise.resolve([]),
    ])
    const linked = new Set(accounts.map((row) => row.provider))
    const baseUrl = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'
    const secretOf = new Map(secrets.map((row) => [row.id, row.secret]))
    return (
        <>
            <AppHeader viewer={viewer} workspace={workspace} notifications={notifications} current="settings" />
            <header className="dots">
                <h1>Instellingen van {workspace.name}</h1>
            </header>

            <section id="accounts">
                <h2>Je koppelingen</h2>
                <p className="lede">
                    Het bord leest pull requests met de koppeling van een lid. Koppel opnieuw als je koppeling is
                    verlopen of ingetrokken.
                </p>
                <ul className="plain-list">
                    {configuredProviders().map((provider) => (
                        <li key={provider}>
                            <span>
                                {PROVIDER_LABEL[provider]}: {linked.has(provider) ? 'gekoppeld' : 'niet gekoppeld'}
                            </span>
                            <form action={linkProviderAction}>
                                <input type="hidden" name="provider" value={provider} />
                                <input type="hidden" name="next" value="/settings" />
                                <button type="submit">{linked.has(provider) ? 'Opnieuw inloggen' : 'Koppelen'}</button>
                            </form>
                        </li>
                    ))}
                    {configuredProviders().length === 0 && (
                        <li>
                            Er is nog geen OAuth-provider ingesteld. Zet BITBUCKET_CLIENT_ID en BITBUCKET_CLIENT_SECRET.
                        </li>
                    )}
                </ul>
            </section>

            <section id="repositories">
                <h2>Repositories</h2>
                <SyncPanel repositories={repos} role={workspace.role} />
                <table className="settings-table">
                    <thead>
                        <tr>
                            <th>Repository</th>
                            <th>Status</th>
                            <th>Laatst gesynchroniseerd</th>
                            <th />
                        </tr>
                    </thead>
                    <tbody>
                        {repos.map((repo) => (
                            <RepositoryRow
                                key={repo.id}
                                repo={repo}
                                manager={manager}
                                webhook={
                                    manager && repo.provider !== 'snapshot'
                                        ? {
                                              url: `${baseUrl}/api/webhooks/${repo.provider}?repository=${repo.id}`,
                                              secret: secretOf.get(repo.id) ?? '',
                                          }
                                        : null
                                }
                            />
                        ))}
                    </tbody>
                </table>
                {manager && (
                    <p>
                        <Link href="/onboarding/repositories">Repositories toevoegen</Link>
                    </p>
                )}
            </section>

            <section id="members">
                <h2>Leden</h2>
                <ul className="plain-list">
                    {members.map((member) => (
                        <li key={member.id}>
                            <span>
                                <b>{member.name}</b> · {member.email}
                            </span>
                            <span className="pill idle">{member.role}</span>
                        </li>
                    ))}
                </ul>
                {manager && (
                    <InvitePanel
                        baseUrl={baseUrl}
                        pending={invitations.map((row) => ({
                            id: row.id,
                            email: row.email,
                            role: row.role ?? 'member',
                            expiresAt: formatDateTime(row.expiresAt.toISOString()),
                        }))}
                    />
                )}
            </section>
        </>
    )
}
