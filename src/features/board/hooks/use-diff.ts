'use client'

import { useEffect, useState } from 'react'

import type { DiffFile, PullRequestNumber } from '@/features/board/types'

type DiffState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; files: DiffFile[] }

const cache = new Map<PullRequestNumber, Promise<DiffFile[]>>()

/**
 * @name loadDiff
 * @description Fetches the changed files of a PR once and shares the request between callers. A failed request
 * is dropped from the cache so the next call retries.
 *
 * @example
 * loadDiff(851).then((files) => files.length)
 */
export function loadDiff(pr: PullRequestNumber) {
    let pending = cache.get(pr)
    if (!pending) {
        pending = fetch(`/api/diffs/${pr}`).then(async (response) => {
            if (!response.ok) throw new Error(String(response.status))
            const files: DiffFile[] = await response.json()
            return files
        })
        pending.catch(() => cache.delete(pr))
        cache.set(pr, pending)
    }
    return pending
}

export function useDiff(pr: PullRequestNumber) {
    const [state, setState] = useState<DiffState>({ status: 'loading' })

    useEffect(() => {
        let active = true
        loadDiff(pr)
            .then((files) => active && setState({ status: 'ready', files }))
            .catch(() => active && setState({ status: 'error' }))
        return () => {
            active = false
        }
    }, [pr])

    return state
}
