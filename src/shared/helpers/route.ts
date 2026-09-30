import type { Route } from 'next'

/**
 * @name toRoute
 * @description Marks an already validated internal path or an OAuth provider URL as a redirect target for typed
 * routes. Only pass paths checked against an allow-list or URLs returned by Better Auth.
 *
 * @example
 * redirect(toRoute(next))
 */
export function toRoute(path: string): Route {
    // Safety: callers pass paths validated by the `next` schema or URLs produced by Better Auth, which typed routes cannot model.
    return path as Route
}
