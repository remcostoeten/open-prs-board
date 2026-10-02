'use client'

import { useEffect, useState } from 'react'

import { loadDiffAction } from '@/features/board/actions'
import type { DiffFile, PullRequestID } from '@/features/board/types'
import type { PublicError } from '@/shared/errors/result'

type DiffState =
    | { status: 'loading' }
    | { status: 'error'; error: PublicError }
    | { status: 'ready'; files: DiffFile[] }

const cache = new Map<PullRequestID, Promise<DiffFile[]>>()

export class DiffLoadError extends Error {
    constructor(readonly error: PublicError) {
        super(error.code)
    }
}

/**
 * @name loadDiff
 * @description Loads the changed files of a PR once through the server action and shares the request between
 * callers. A failed request is dropped from the cache so the next call retries.
 *
 * @example
 * loadDiff(pr.id).then((files) => files.length)
 */
export function loadDiff(pr: PullRequestID) {
    let pending = cache.get(pr)
    if (!pending) {
        pending = loadDiffAction(pr).then((result) => {
            if (!result.ok) throw new DiffLoadError(result.error)
            return result.value
        })
        pending.catch(() => cache.delete(pr))
        cache.set(pr, pending)
    }
    return pending
}

const FALLBACK: PublicError = {
    code: 'unknown',
    message: 'De diff kon niet worden geladen.',
    recovery: 'retry',
    reference: null,
}

export function useDiff(pr: PullRequestID, attempt: number): DiffState {
    const key = `${pr}:${attempt}`
    const [settled, setSettled] = useState<{ key: string; state: DiffState } | null>(null)

    useEffect(() => {
        let active = true
        loadDiff(pr)
            .then((files) => active && setSettled({ key, state: { status: 'ready', files } }))
            .catch(
                (error: Error) =>
                    active &&
                    setSettled({
                        key,
                        state: { status: 'error', error: error instanceof DiffLoadError ? error.error : FALLBACK },
                    }),
            )
        return () => {
            active = false
        }
    }, [pr, key])

    return settled?.key === key ? settled.state : { status: 'loading' }
}
