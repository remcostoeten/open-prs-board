'use client'

import { createContext, type ReactNode, useContext } from 'react'

import type { Board, PullRequest } from '@/features/board/types'

type Props = {
    board: Board
    children: ReactNode
}

const BoardContext = createContext<Board | null>(null)
const PullRequestContext = createContext<PullRequest | null>(null)

export function BoardProvider({ board, children }: Props) {
    return <BoardContext value={board}>{children}</BoardContext>
}

export function PullRequestProvider({ pr, children }: { pr: PullRequest; children: ReactNode }) {
    return <PullRequestContext value={pr}>{children}</PullRequestContext>
}

export function useBoard() {
    const board = useContext(BoardContext)
    if (!board) throw new Error('useBoard must be used inside BoardProvider')
    return board
}

export function usePullRequest() {
    const pr = useContext(PullRequestContext)
    if (!pr) throw new Error('usePullRequest must be used inside PullRequestProvider')
    return pr
}
