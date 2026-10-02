import type { AppError } from '@/shared/errors/result'

// Matches a Bearer or Basic credential, the value after a token-like key, and long opaque tokens.
const CREDENTIAL = /\b(bearer|basic)\s+[^\s"',}]+/gi
const KEYED =
    /((?:access_|refresh_|id_)?token|secret|password|authorization|client_secret)(["'\s:=]+)(?!\[redacted\]|bearer\b|basic\b)[^\s"',}&]+/gi

/**
 * @name redact
 * @description Masks token-like values in technical error text before it is logged or stored.
 *
 * @example
 * redact('Authorization: Bearer abc') // 'Authorization: [redacted]'
 */
export function redact(text: string) {
    return text.replace(CREDENTIAL, '$1 [redacted]').replace(KEYED, '$1$2[redacted]')
}

/**
 * @name logError
 * @description Writes one structured JSON line for a failure with its correlation ID, code, provider status and
 * redacted technical detail. User-facing text never comes from here.
 *
 * @example
 * if (!result.ok) logError(result.error, 'sync.pull_requests')
 */
export function logError(error: AppError, scope: string) {
    console.error(
        JSON.stringify({
            level: 'error',
            scope,
            code: error.code,
            retryable: error.retryable,
            ...error.context,
            detail: redact(error.detail),
            at: new Date().toISOString(),
        }),
    )
}
