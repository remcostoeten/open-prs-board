import { cancel, confirm, intro, isCancel, log, outro, select } from '@clack/prompts'
import { asc, eq } from 'drizzle-orm'

import { member, organization, user } from '@/server/db/auth-schema'
import { closeDatabase, db } from '@/server/db/client'
import type { ID } from '@/store/semantic'

const EXIT = 'exit'
const BACK = 'back'

type Membership = {
    id: ID
    workspace: string
    role: string
}

type Account = {
    id: ID
    name: string
    email: string
    memberships: Membership[]
}

async function loadAccounts() {
    const rows = await db
        .select({
            id: user.id,
            name: user.name,
            email: user.email,
            membershipId: member.id,
            workspace: organization.slug,
            role: member.role,
        })
        .from(user)
        .leftJoin(member, eq(member.userId, user.id))
        .leftJoin(organization, eq(organization.id, member.organizationId))
        .orderBy(asc(user.email), asc(organization.slug))

    const accounts = new Map<ID, Account>()
    for (const row of rows) {
        const account = accounts.get(row.id) ?? { id: row.id, name: row.name, email: row.email, memberships: [] }
        if (row.membershipId && row.workspace && row.role) {
            account.memberships.push({ id: row.membershipId, workspace: row.workspace, role: row.role })
        }
        accounts.set(row.id, account)
    }
    return [...accounts.values()]
}

function describe(account: Account) {
    if (account.memberships.length === 0) return 'no workspace'
    return account.memberships.map((membership) => `${membership.role} in ${membership.workspace}`).join(', ')
}

async function closeAndExit(message: string) {
    cancel(message)
    await closeDatabase()
    process.exit(0)
}

async function pickAccount(accounts: Account[]) {
    const choice = await select({
        message: 'Which user?',
        maxItems: 12,
        options: [
            ...accounts.map((account) => ({
                value: account.id,
                label: `${account.name} <${account.email}>`,
                hint: describe(account),
            })),
            { value: EXIT, label: 'Exit' },
        ],
    })
    if (isCancel(choice)) await closeAndExit('Stopped.')
    return accounts.find((account) => account.id === choice) ?? null
}

async function pickMembership(account: Account) {
    if (account.memberships.length === 1) return account.memberships[0] ?? null
    const choice = await select({
        message: `Which workspace of ${account.email}?`,
        options: [
            ...account.memberships.map((membership) => ({
                value: membership.id,
                label: membership.workspace,
                hint: membership.role,
            })),
            { value: BACK, label: 'Back' },
        ],
    })
    if (isCancel(choice)) await closeAndExit('Stopped.')
    return account.memberships.find((membership) => membership.id === choice) ?? null
}

async function toggleAdmin(account: Account, membership: Membership) {
    if (membership.role === 'owner') {
        log.warn(`${account.email} owns ${membership.workspace}. An owner's role is not changed here.`)
        return
    }
    const nextRole = membership.role === 'admin' ? 'member' : 'admin'
    const question =
        nextRole === 'admin'
            ? `Make ${account.email} an admin of ${membership.workspace}?`
            : `Revoke admin for ${account.email} in ${membership.workspace}?`
    const confirmed = await confirm({ message: question })
    if (isCancel(confirmed)) await closeAndExit('Stopped.')
    if (!confirmed) return
    await db.update(member).set({ role: nextRole }).where(eq(member.id, membership.id))
    log.success(`${account.email} is now ${nextRole} of ${membership.workspace}.`)
}

intro('Workspace admins')
for (;;) {
    const accounts = await loadAccounts()
    if (accounts.length === 0) {
        outro('No users yet.')
        break
    }
    const account = await pickAccount(accounts)
    if (!account) {
        outro('Done.')
        break
    }
    if (account.memberships.length === 0) {
        log.warn(`${account.email} is not in any workspace yet.`)
        continue
    }
    const membership = await pickMembership(account)
    if (membership) await toggleAdmin(account, membership)
}
await closeDatabase()
