/**
 * @name noop
 * @description Does nothing. Used to swallow an error on purpose where a bare empty catch is not allowed.
 *
 * @example
 * try {
 *     localStorage.setItem(key, value)
 * } catch {
 *     noop()
 * }
 */
export function noop() {}
