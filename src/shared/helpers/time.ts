import type { Nullable, Timestamp } from '@/store/semantic'

/**
 * @name isSameInstant
 * @description Whether two timestamps point at the same millisecond, regardless of how each is formatted. Stored
 * timestamps come back from Postgres normalised to `...000Z`, while providers send their own format.
 *
 * @example
 * isSameInstant('2026-09-03T10:00:00Z', '2026-09-03T10:00:00.000Z')
 */
export function isSameInstant(a: Nullable<Timestamp> | undefined, b: Nullable<Timestamp> | undefined) {
    if (!a || !b) return a === b
    return Date.parse(a) === Date.parse(b)
}
