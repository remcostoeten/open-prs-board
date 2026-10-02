import { and, asc, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { auth } from '@/server/auth'
import { member, organization } from '@/server/db/auth-schema'
import { db } from '@/server/db/client'
import { toRoute } from '@/shared/helpers/route'
import type { ID } from '@/store/semantic'

import type { Role } from '@/features/board/types'

export type { Role }

export type Viewer = {
    id: ID
    name: string
    email: string
    emailVerified: boolean
}

export type Workspace = {
    id: ID
    name: string
    slug: string
    role: Role
}

function toRole(role: string): Role {
    return role === 'owner' || role === 'admin' ? role : 'member'
}

/**
 * @name getViewer
 * @description Reads the Better Auth session from the request cookies. Returns null when nobody is signed in.
 *
 * @example
 * const viewer = await getViewer()
 */
export async function getViewer(): Promise<Viewer | null> {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) return null
    const { id, name, email, emailVerified } = session.user
    return { id, name, email, emailVerified }
}

/**
 * @name requireViewer
 * @description Returns the signed-in user or redirects to the sign-in page, keeping the current path as `next`.
 *
 * @example
 * const viewer = await requireViewer('/board')
 */
export async function requireViewer(next = '/board'): Promise<Viewer> {
    const viewer = await getViewer()
    if (!viewer) redirect(toRoute(`/sign-in?next=${encodeURIComponent(next)}`))
    return viewer
}

/**
 * @name findWorkspace
 * @description Returns the viewer's active workspace with their role: the session's active organization when they
 * are still a member of it, else their oldest membership. Null when they belong to none.
 *
 * @example
 * const workspace = await findWorkspace(viewer.id)
 */
export async function findWorkspace(userId: ID): Promise<Workspace | null> {
    const session = await auth.api.getSession({ headers: await headers() })
    const active = session?.session.activeOrganizationId
    const rows = await db
        .select({ id: organization.id, name: organization.name, slug: organization.slug, role: member.role })
        .from(member)
        .innerJoin(organization, eq(member.organizationId, organization.id))
        .where(eq(member.userId, userId))
        .orderBy(asc(member.createdAt))
    const row = rows.find((candidate) => candidate.id === active) ?? rows[0]
    return row ? { ...row, role: toRole(row.role) } : null
}

/**
 * @name requireWorkspace
 * @description Returns the viewer and their active workspace, redirecting to sign-in or to workspace creation
 * when either is missing.
 *
 * @example
 * const { viewer, workspace } = await requireWorkspace('/board')
 */
export async function requireWorkspace(next = '/board') {
    const viewer = await requireViewer(next)
    const workspace = await findWorkspace(viewer.id)
    if (!workspace) redirect('/onboarding/workspace')
    return { viewer, workspace }
}

/**
 * @name workspaceRole
 * @description Returns the role of a user in a workspace, or null when they are not a member. Server actions call
 * this with the workspace id they act on, never trusting a role sent by the client.
 *
 * @example
 * if (!isManager(await workspaceRole(viewer.id, organizationId))) return denied()
 */
export async function workspaceRole(userId: ID, organizationId: ID): Promise<Role | null> {
    const [row] = await db
        .select({ role: member.role })
        .from(member)
        .where(and(eq(member.userId, userId), eq(member.organizationId, organizationId)))
    return row ? toRole(row.role) : null
}

/**
 * @name isManager
 * @description Whether a role may connect repositories, manage invitations and delete data.
 *
 * @example
 * isManager('admin') // true
 */
export function isManager(role: Role | null) {
    return role === 'owner' || role === 'admin'
}
