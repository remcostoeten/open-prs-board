'use client'

import { createContext, type ReactNode, useContext } from 'react'

const CanWriteContext = createContext(false)

type Props = {
    children: ReactNode
    fallback: ReactNode
}

export function CanWriteProvider({ value, children }: { value: boolean; children: ReactNode }) {
    return <CanWriteContext value={value}>{children}</CanWriteContext>
}

export function useCanWrite() {
    return useContext(CanWriteContext)
}

export function Editable({ children, fallback }: Props) {
    return useCanWrite() ? children : fallback
}
