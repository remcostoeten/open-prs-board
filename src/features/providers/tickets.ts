import type { Nullable } from '@/store/semantic'

const TICKET = /\b([A-Z][A-Z0-9]+-\d+)\b/

/**
 * @name findTicket
 * @description Finds the first Jira-style key (like `WEB-123`) in a PR title or branch name.
 *
 * @example
 * findTicket('feature/WEB-12-login', 'Add login') // 'WEB-12'
 */
export function findTicket(...sources: string[]): Nullable<string> {
    for (const source of sources) {
        const match = TICKET.exec(source)
        if (match?.[1]) return match[1]
    }
    return null
}
