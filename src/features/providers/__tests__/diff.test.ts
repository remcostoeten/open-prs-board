import { describe, expect, test } from 'bun:test'

import { MAX_FILE_DIFF_BYTES, splitUnifiedDiff } from '@/features/providers/diff'

const DIFF = [
    'diff --git a/src/a.ts b/src/a.ts',
    'index 1..2 100644',
    '--- a/src/a.ts',
    '+++ b/src/a.ts',
    '@@ -1,2 +1,2 @@',
    '-old',
    '+new',
    ' same',
    'diff --git a/old.ts b/renamed.ts',
    'similarity index 90%',
    'rename from old.ts',
    'rename to renamed.ts',
    'diff --git a/gone.ts b/gone.ts',
    'deleted file mode 100644',
    '--- a/gone.ts',
    '+++ /dev/null',
    '@@ -1 +0,0 @@',
    '-bye',
    'diff --git a/logo.png b/logo.png',
    'new file mode 100644',
    'Binary files /dev/null and b/logo.png differ',
].join('\n')

describe('splitUnifiedDiff', () => {
    test('splits files with status, rename source and line counts', () => {
        const files = splitUnifiedDiff(DIFF)
        expect(files.map((file) => [file.path, file.status, file.old, file.add, file.rem, file.binary])).toEqual([
            ['src/a.ts', 'modified', null, 1, 1, false],
            ['renamed.ts', 'modified', 'old.ts', 0, 0, false],
            ['gone.ts', 'removed', null, 0, 1, false],
            ['logo.png', 'added', null, 0, 0, true],
        ])
        expect(files[0]?.diff.startsWith('@@ -1,2 +1,2 @@')).toBe(true)
    })

    test('marks oversized files truncated and drops their text', () => {
        const big = `diff --git a/big.txt b/big.txt\n@@ -0,0 +1 @@\n+${'x'.repeat(MAX_FILE_DIFF_BYTES + 1)}`
        const [file] = splitUnifiedDiff(big)
        expect(file?.truncated).toBe(true)
        expect(file?.diff).toBe('')
        expect(file?.add).toBe(1)
    })
})
