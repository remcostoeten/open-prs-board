import { describe, expect, test } from 'bun:test'

import { mentionedMembers } from '@/features/board/mentions'
import type { Member } from '@/features/board/types'

const members: Member[] = [
    { id: 'u1', name: 'Remco Stoeten', email: 'remco@acme.nl', role: 'owner' },
    { id: 'u2', name: 'Daan de Vries', email: 'ddv@acme.nl', role: 'member' },
    { id: 'u3', name: 'Pieter', email: 'pieter@acme.nl', role: 'member' },
]

describe('mentionedMembers', () => {
    test('matches first names, full names without spaces and email handles', () => {
        const found = mentionedMembers('Kun @daan en @ddv kijken? cc @RemcoStoeten', members, 'u3')
        expect(found.map((member) => member.id)).toEqual(['u1', 'u2'])
    })

    test('never notifies the author', () => {
        expect(mentionedMembers('@pieter', members, 'u3')).toEqual([])
    })
})
