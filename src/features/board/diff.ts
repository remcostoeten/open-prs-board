import type { Nullable } from '@/store/semantic'

export type DiffRow =
    | { kind: 'hunk'; label: string; context: string }
    | { kind: 'line'; tone: 'a' | 'r' | ''; old: Nullable<number>; new: Nullable<number>; sign: string; text: string }

const HUNK = /@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@\s?(.*)/

function hunkLabel(match: RegExpExecArray, start: number) {
    const length = Number(match[4] ?? 1)
    if (match[1] === '0' && match[2] === '0') return `Nieuw bestand · regel 1–${length}`
    return length ? `Regel ${start}–${start + length - 1}` : `Regel ${start}`
}

/**
 * @name parseDiff
 * @description Splits a unified diff into hunk headers and numbered lines for the diff table.
 *
 * @example
 * parseDiff('@@ -1 +1 @@\n-a\n+b')
 */
export function parseDiff(diff: string): DiffRow[] {
    const rows: DiffRow[] = []
    let oldLine = 0
    let newLine = 0
    for (const text of diff.split('\n')) {
        if (text === '') continue
        if (text.startsWith('@@')) {
            const match = HUNK.exec(text)
            if (!match) {
                rows.push({ kind: 'hunk', label: text, context: '' })
                continue
            }
            oldLine = Number(match[1])
            newLine = Number(match[3])
            rows.push({ kind: 'hunk', label: hunkLabel(match, newLine), context: match[5] ?? '' })
        } else if (text.startsWith('+'))
            rows.push({ kind: 'line', tone: 'a', old: null, new: newLine++, sign: '+', text: text.slice(1) })
        else if (text.startsWith('-'))
            rows.push({ kind: 'line', tone: 'r', old: oldLine++, new: null, sign: '−', text: text.slice(1) })
        else if (text.startsWith('\\')) rows.push({ kind: 'line', tone: '', old: null, new: null, sign: '', text })
        else rows.push({ kind: 'line', tone: '', old: oldLine++, new: newLine++, sign: '', text: text.slice(1) })
    }
    return rows
}
