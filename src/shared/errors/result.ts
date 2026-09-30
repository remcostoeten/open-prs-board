import { ERRORS, type ErrorCode, type Recovery } from '@/shared/errors/codes'
import type { ID, Nullable } from '@/store/semantic'

export type ErrorContext = {
    correlationId?: ID
    provider?: string
    repositoryId?: ID
    pullRequestId?: ID
    status?: number
    providerRequestId?: string
}

export type AppError = {
    code: ErrorCode
    retryable: boolean
    retryAfterMs: Nullable<number>
    recovery: Recovery
    context: ErrorContext
    detail: string
}

export type PublicError = {
    code: ErrorCode
    message: string
    recovery: Recovery
    reference: Nullable<string>
    provider?: string
}

export type Result<Value> = { ok: true; value: Value } | { ok: false; error: AppError }

export type ActionResult<Value> = { ok: true; value: Value } | { ok: false; error: PublicError }

const PROVIDER_LABELS: Record<string, string> = { bitbucket: 'Bitbucket', github: 'GitHub', snapshot: 'de snapshot' }

function providerLabel(provider: string | undefined) {
    return (provider && PROVIDER_LABELS[provider]) || 'de provider'
}

/**
 * @name publicMessage
 * @description The user-facing message for an error code, with the provider name filled in.
 *
 * @example
 * publicMessage('rate_limited', 'bitbucket')
 */
export function publicMessage(code: ErrorCode, provider?: string) {
    return ERRORS[code].message.replaceAll('{provider}', providerLabel(provider))
}

/**
 * @name ok
 * @description Wraps a value in a successful `Result`.
 *
 * @example
 * return ok(repositories)
 */
export function ok<Value>(value: Value): Result<Value> {
    return { ok: true, value }
}

/**
 * @name fail
 * @description Builds a failed `Result` for an error code. Retryability and recovery come from the code table;
 * `detail` is technical text for logs only.
 *
 * @example
 * return fail('invalid_response', 'pull request list did not parse', { status: 200 })
 */
export function fail<Value>(
    code: ErrorCode,
    detail: string,
    context: ErrorContext = {},
    retryAfterMs: Nullable<number> = null,
): Result<Value> {
    return { ok: false, error: appError(code, detail, context, retryAfterMs) }
}

/**
 * @name appError
 * @description Builds an `AppError` for an error code with the retry and recovery policy from the code table.
 *
 * @example
 * const error = appError('timeout', 'GET /pullrequests aborted after 15s')
 */
export function appError(
    code: ErrorCode,
    detail: string,
    context: ErrorContext = {},
    retryAfterMs: Nullable<number> = null,
): AppError {
    const spec = ERRORS[code]
    return { code, retryable: spec.retryable, retryAfterMs, recovery: spec.recovery, context, detail }
}

/**
 * @name toPublicError
 * @description Strips an `AppError` down to what a user may see: the code, the fixed message for that code, the
 * recovery and a short reference from the correlation ID. Technical detail never crosses this line.
 *
 * @example
 * return { ok: false, error: toPublicError(result.error) }
 */
export function toPublicError(error: AppError): PublicError {
    return {
        code: error.code,
        message: publicMessage(error.code, error.context.provider),
        recovery: error.recovery,
        reference: error.context.correlationId?.slice(0, 8) ?? null,
        provider: error.context.provider,
    }
}
