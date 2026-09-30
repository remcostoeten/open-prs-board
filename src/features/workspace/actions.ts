'use server'

import { APIError } from 'better-auth/api'
import { and, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { refresh } from 'next/cache'
import { z } from 'zod'

import { auth } from '@/server/auth'
import { invitation } from '@/server/db/auth-schema'
import { db } from '@/server/db/client'
import { denied, managerActor } from '@/server/guard'
import { findWorkspace, requireViewer } from '@/server/session'
import type { ActionResult } from '@/shared/errors/result'

export type WorkspaceFormState = { error: string }

const workspaceSchema = z.object({ name: z.string().trim().min(2).max(60) })

function slugify(name: string) {
    const base = name
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/[\s_]+/g, '-')
        .slice(0, 40)
    return `${base || 'workspace'}-${crypto.randomUUID().slice(0, 6)}`
}

export async function createWorkspaceAction(_state: WorkspaceFormState, form: FormData): Promise<WorkspaceFormState> {
    const viewer = await requireViewer('/onboarding/workspace')
    const parsed = workspaceSchema.safeParse(Object.fromEntries(form))
    if (!parsed.success) return { error: 'Geef de workspace een naam van minstens 2 tekens.' }
    if (await findWorkspace(viewer.id)) redirect('/onboarding/repositories')
    try {
        await auth.api.createOrganization({
            body: { name: parsed.data.name, slug: slugify(parsed.data.name) },
            headers: await headers(),
        })
    } catch (error) {
        console.error(JSON.stringify({ level: 'error', scope: 'workspace.create', detail: String(error) }))
        return { error: 'De workspace kon niet worden aangemaakt. Probeer het opnieuw.' }
    }
    redirect('/onboarding/repositories')
}

const inviteSchema = z.object({ email: z.email(), role: z.enum(['member', 'admin']) })

export type InviteResult = ActionResult<{ id: string }>

export async function inviteAction(email: string, role: string): Promise<InviteResult> {
    const actor = await managerActor()
    if (!actor) return denied('forbidden')
    const parsed = inviteSchema.safeParse({ email, role })
    if (!parsed.success) return denied('invalid_input', actor.correlationId)
    try {
        const created = await auth.api.createInvitation({
            body: {
                email: parsed.data.email,
                role: parsed.data.role,
                organizationId: actor.workspace.id,
                resend: true,
            },
            headers: await headers(),
        })
        refresh()
        return { ok: true, value: { id: created.id } }
    } catch (error) {
        console.error(
            JSON.stringify({
                level: 'error',
                scope: 'invite.create',
                correlationId: actor.correlationId,
                detail: String(error),
            }),
        )
        if (error instanceof APIError && error.body?.code === 'USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION')
            return {
                ok: false,
                error: {
                    code: 'invalid_input',
                    message: 'Deze persoon is al lid van de workspace.',
                    recovery: 'none',
                    reference: null,
                },
            }
        return denied('unknown', actor.correlationId)
    }
}

export async function cancelInvitationAction(id: string): Promise<ActionResult<null>> {
    const actor = await managerActor()
    if (!actor) return denied('forbidden')
    const [row] = await db
        .select()
        .from(invitation)
        .where(and(eq(invitation.id, id), eq(invitation.organizationId, actor.workspace.id)))
    if (!row) return denied('not_found', actor.correlationId)
    await auth.api.cancelInvitation({ body: { invitationId: id }, headers: await headers() })
    refresh()
    return { ok: true, value: null }
}

export async function acceptInvitationAction(id: string): Promise<ActionResult<null>> {
    await requireViewer(`/invite/${id}`)
    try {
        const accepted = await auth.api.acceptInvitation({ body: { invitationId: id }, headers: await headers() })
        const organizationId = accepted?.invitation.organizationId
        if (organizationId) await auth.api.setActiveOrganization({ body: { organizationId }, headers: await headers() })
    } catch (error) {
        const code = error instanceof APIError ? String(error.body?.code ?? '') : ''
        console.error(
            JSON.stringify({ level: 'error', scope: 'invite.accept', invitationId: id, code, detail: String(error) }),
        )
        const message = code.includes('VERIFICATION')
            ? 'Je e-mailadres is nog niet geverifieerd. Vraag een owner of admin om het te bevestigen, of log in met Bitbucket of GitHub.'
            : code.includes('RECIPIENT') || code.includes('NOT_THE_RECIPIENT')
              ? 'Deze uitnodiging is voor een ander e-mailadres. Log in met het account waarvoor de uitnodiging is gemaakt.'
              : 'Deze uitnodiging is verlopen, al gebruikt of ingetrokken. Vraag om een nieuwe link.'
        return { ok: false, error: { code: 'forbidden', message, recovery: 'contact_admin', reference: null } }
    }
    redirect('/board')
}

export async function switchWorkspaceAction(organizationId: string) {
    await auth.api.setActiveOrganization({ body: { organizationId }, headers: await headers() })
    redirect('/board')
}
