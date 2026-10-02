import type { SyncedDiffFile } from '@/features/providers/types'
import type { Nullable } from '@/store/semantic'

export const MAX_FILE_DIFF_BYTES = 1_000_000

const HEADER = /^diff --git a\/(.+?) b\/(.+)$/
const RENAME_FROM = /^rename from (.+)$/

function status(lines: string[]): SyncedDiffFile['status'] {
    if (lines.some((line) => line.startsWith('new file mode'))) return 'added'
    if (lines.some((line) => line.startsWith('deleted file mode'))) return 'removed'
    return 'modified'
}

function renamedFrom(lines: string[]): Nullable<string> {
    for (const line of lines) {
        const match = RENAME_FROM.exec(line)
        if (match?.[1]) return match[1]
    }
    return null
}

/**
 * @name splitUnifiedDiff
 * @description Splits a multi-file `git diff` into one entry per file with status, rename source, line counts and
 * the hunks. A file whose hunks exceed 1 MB keeps its counts but drops the text and is marked truncated.
 *
 * @example
 * const files = splitUnifiedDiff(await response.text())
 */
export function splitUnifiedDiff(text: string): SyncedDiffFile[] {
    const files: SyncedDiffFile[] = []
    const chunks = text.split(/^(?=diff --git )/m).filter((chunk) => chunk.startsWith('diff --git '))
    for (const chunk of chunks) {
        const lines = chunk.split('\n')
        const header = HEADER.exec(lines[0] ?? '')
        if (!header?.[2]) continue
        const hunkStart = lines.findIndex((line) => line.startsWith('@@'))
        const meta = hunkStart === -1 ? lines : lines.slice(0, hunkStart)
        const hunks = hunkStart === -1 ? [] : lines.slice(hunkStart)
        const binary = meta.some((line) => line.startsWith('Binary files') || line === 'GIT binary patch')
        const body = hunks.join('\n')
        const truncated = body.length > MAX_FILE_DIFF_BYTES
        const fileStatus = status(meta)
        files.push({
            path: fileStatus === 'removed' ? (header[1] ?? header[2]) : header[2],
            old: renamedFrom(meta),
            status: fileStatus,
            add: hunks.filter((line) => line.startsWith('+')).length,
            rem: hunks.filter((line) => line.startsWith('-')).length,
            binary,
            truncated,
            diff: truncated || binary ? '' : body,
        })
    }
    return files
}
