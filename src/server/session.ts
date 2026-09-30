import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'

const COOKIE = 'board-editor'
const MAX_AGE = 60 * 60 * 24 * 30

function sign(value: string) {
    const secret = process.env.BOARD_SESSION_SECRET
    if (!secret) throw new Error('BOARD_SESSION_SECRET is not set')
    return createHmac('sha256', secret).update(value).digest('base64url')
}

function safeEqual(a: string, b: string) {
    const left = Buffer.from(a)
    const right = Buffer.from(b)
    return left.length === right.length && timingSafeEqual(left, right)
}

/**
 * @name isEditingEnabled
 * @description Whether the server has a passcode and session secret configured. Without them every viewer is
 * read-only.
 *
 * @example
 * if (!isEditingEnabled()) return forbidden()
 */
export function isEditingEnabled() {
    return !!process.env.BOARD_EDITOR_PASSCODE && !!process.env.BOARD_SESSION_SECRET
}

/**
 * @name canEdit
 * @description Whether the current request carries a valid editor cookie.
 *
 * @example
 * if (!(await canEdit())) return Response.json({ error: 'not_granted' }, { status: 403 })
 */
export async function canEdit() {
    if (!isEditingEnabled()) return false
    const value = (await cookies()).get(COOKIE)?.value
    return !!value && safeEqual(value, sign('editor'))
}

/**
 * @name signIn
 * @description Checks the passcode against `BOARD_EDITOR_PASSCODE` and sets the editor cookie on a match.
 *
 * @example
 * const ok = await signIn(formData.get('passcode'))
 */
export async function signIn(passcode: string) {
    const expected = process.env.BOARD_EDITOR_PASSCODE
    if (!isEditingEnabled() || !expected || !safeEqual(passcode, expected)) return false
    ;(await cookies()).set(COOKIE, sign('editor'), {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: MAX_AGE,
    })
    return true
}

/**
 * @name signOut
 * @description Removes the editor cookie.
 *
 * @example
 * await signOut()
 */
export async function signOut() {
    ;(await cookies()).delete(COOKIE)
}
