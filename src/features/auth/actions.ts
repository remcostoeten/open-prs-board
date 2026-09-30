'use server'

import { APIError } from 'better-auth/api'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { auth } from '@/server/auth'
import { toRoute } from '@/shared/helpers/route'

export type AuthFormState = { error: string; email: string }

const nextSchema = z
    .string()
    .regex(/^\/(?!\/)[\w\-/?=&%.]*$/)
    .catch('/board')

const signInSchema = z.object({ email: z.email(), password: z.string().min(1), next: nextSchema })
const signUpSchema = z.object({
    name: z.string().trim().min(1).max(80),
    email: z.email(),
    password: z.string().min(10),
    next: nextSchema,
})

function message(error: unknown) {
    if (error instanceof APIError) {
        if (error.body?.code === 'INVALID_EMAIL_OR_PASSWORD') return 'E-mailadres of wachtwoord klopt niet.'
        if (error.body?.code === 'USER_ALREADY_EXISTS' || error.body?.code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL')
            return 'Er bestaat al een account met dit e-mailadres.'
        if (error.body?.code === 'PASSWORD_TOO_SHORT') return 'Het wachtwoord moet minstens 10 tekens hebben.'
    }
    console.error(JSON.stringify({ level: 'error', scope: 'auth', detail: String(error) }))
    return 'Inloggen lukte niet. Probeer het opnieuw.'
}

export async function signInAction(_state: AuthFormState, form: FormData): Promise<AuthFormState> {
    const parsed = signInSchema.safeParse(Object.fromEntries(form))
    const email = String(form.get('email') ?? '')
    if (!parsed.success) return { error: 'Vul een geldig e-mailadres en wachtwoord in.', email }
    try {
        await auth.api.signInEmail({
            body: { email: parsed.data.email, password: parsed.data.password },
            headers: await headers(),
        })
    } catch (error) {
        return { error: message(error), email }
    }
    redirect(toRoute(parsed.data.next))
}

export async function signUpAction(_state: AuthFormState, form: FormData): Promise<AuthFormState> {
    const parsed = signUpSchema.safeParse(Object.fromEntries(form))
    const email = String(form.get('email') ?? '')
    if (!parsed.success)
        return { error: 'Vul je naam, een geldig e-mailadres en een wachtwoord van minstens 10 tekens in.', email }
    try {
        await auth.api.signUpEmail({
            body: { name: parsed.data.name, email: parsed.data.email, password: parsed.data.password },
            headers: await headers(),
        })
    } catch (error) {
        return { error: message(error), email }
    }
    redirect(parsed.data.next.startsWith('/invite/') ? toRoute(parsed.data.next) : '/onboarding/workspace')
}

export async function signInWithProviderAction(form: FormData) {
    const provider = z.enum(['bitbucket', 'github']).parse(form.get('provider'))
    const next = nextSchema.parse(form.get('next'))
    const callbackURL = next
    const result = await auth.api.signInSocial({ body: { provider, callbackURL }, headers: await headers() })
    if (!('url' in result) || !result.url) redirect('/sign-in?error=provider')
    redirect(toRoute(result.url))
}

export async function linkProviderAction(form: FormData) {
    const provider = z.enum(['bitbucket', 'github']).parse(form.get('provider'))
    const next = nextSchema.parse(form.get('next'))
    const result = await auth.api.linkSocialAccount({ body: { provider, callbackURL: next }, headers: await headers() })
    redirect(toRoute(result.url))
}

export async function signOutAction() {
    await auth.api.signOut({ headers: await headers() })
    redirect('/sign-in')
}
