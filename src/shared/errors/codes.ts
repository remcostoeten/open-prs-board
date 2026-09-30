export type ErrorCode =
    | 'auth_expired'
    | 'auth_revoked'
    | 'access_lost'
    | 'forbidden'
    | 'not_found'
    | 'invalid_input'
    | 'rate_limited'
    | 'timeout'
    | 'provider_unavailable'
    | 'invalid_response'
    | 'invalid_diff'
    | 'webhook_invalid'
    | 'unknown'

export type Recovery = 'retry' | 'reauthenticate' | 'reconnect_repository' | 'contact_admin' | 'none'

type ErrorSpec = {
    retryable: boolean
    recovery: Recovery
    message: string
}

export const ERRORS: Record<ErrorCode, ErrorSpec> = {
    auth_expired: {
        retryable: true,
        recovery: 'reauthenticate',
        message: 'Je {provider}-sessie is verlopen. Log opnieuw in om verder te gaan.',
    },
    auth_revoked: {
        retryable: false,
        recovery: 'reauthenticate',
        message: 'Je {provider}-koppeling is niet meer geldig. Log opnieuw in met {provider}.',
    },
    access_lost: {
        retryable: false,
        recovery: 'reconnect_repository',
        message: 'Er is geen toegang meer tot deze repository.',
    },
    forbidden: {
        retryable: false,
        recovery: 'contact_admin',
        message: 'Je hebt hier geen rechten voor. Vraag een owner of admin van deze workspace.',
    },
    not_found: { retryable: false, recovery: 'none', message: 'Dit bestaat niet (meer).' },
    invalid_input: { retryable: false, recovery: 'none', message: 'De invoer klopt niet. Controleer de velden.' },
    rate_limited: {
        retryable: true,
        recovery: 'none',
        message: '{provider} beperkt tijdelijk het aantal verzoeken. De synchronisatie gaat later vanzelf verder.',
    },
    timeout: { retryable: true, recovery: 'retry', message: '{provider} reageerde niet op tijd.' },
    provider_unavailable: {
        retryable: true,
        recovery: 'retry',
        message: '{provider} is tijdelijk niet bereikbaar.',
    },
    invalid_response: {
        retryable: false,
        recovery: 'retry',
        message: '{provider} gaf een antwoord dat we niet konden lezen.',
    },
    invalid_diff: {
        retryable: false,
        recovery: 'none',
        message: 'Deze diff kan niet getoond worden. Bekijk hem bij {provider}.',
    },
    webhook_invalid: { retryable: false, recovery: 'none', message: 'Ongeldige webhook.' },
    unknown: { retryable: false, recovery: 'retry', message: 'Er ging iets mis.' },
}
