import type { Member } from '@/features/board/types'
import type { ID } from '@/store/semantic'

const MENTION = /@([\p{L}\p{N}._-]+)/gu

function handle(value: string) {
    return value.toLowerCase().replace(/\s+/g, '')
}

/**
 * @name mentionedMembers
 * @description Finds workspace members mentioned in a comment as `@name`. A token matches a member's name without
 * spaces, their first name, or the part of their email before the `@`. The author is never included.
 *
 * @example
 * mentionedMembers('Kun jij kijken @daan?', members, viewer.id)
 */
export function mentionedMembers(body: string, members: Member[], authorId: ID): Member[] {
    const tokens = new Set([...body.matchAll(MENTION)].map((match) => (match[1] ?? '').toLowerCase()))
    return members.filter((member) => {
        if (member.id === authorId) return false
        const first = handle(member.name.split(' ')[0] ?? '')
        const local = member.email.split('@')[0]?.toLowerCase() ?? ''
        return tokens.has(handle(member.name)) || tokens.has(first) || tokens.has(local)
    })
}
