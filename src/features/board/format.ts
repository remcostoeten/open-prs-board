import type { Timestamp } from '@/store/semantic'

const dateTime = new Intl.DateTimeFormat('nl-NL', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Amsterdam',
})

const day = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', timeZone: 'Europe/Amsterdam' })
const clock = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'Europe/Amsterdam',
})

/**
 * @name formatDateTime
 * @description Formats a timestamp as a short Dutch date and time in Amsterdam time, like `28 sep, 10:42`.
 *
 * @example
 * formatDateTime('2026-09-28T08:42:00Z')
 */
export function formatDateTime(at: Timestamp) {
    return dateTime.format(new Date(at))
}

/**
 * @name formatDayAndClock
 * @description Splits a timestamp into the day and the time shown in the Bijgewerkt column.
 *
 * @example
 * const [date, time] = formatDayAndClock(pr.updatedAt)
 */
export function formatDayAndClock(at: Timestamp) {
    const date = new Date(at)
    const parts = day.formatToParts(date)
    function part(type: Intl.DateTimeFormatPartTypes) {
        return parts.find((p) => p.type === type)?.value ?? ''
    }
    return [`${part('day')} ${part('month')}`, clock.format(date)] as const
}

/**
 * @name formatCount
 * @description Formats a line count with a thousands separator, like `1,633`.
 *
 * @example
 * formatCount(1633)
 */
export function formatCount(value: number) {
    return value.toLocaleString('en')
}
