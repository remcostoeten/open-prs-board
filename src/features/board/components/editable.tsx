'use client'

import { createContext, type ReactNode, Suspense, use, useContext } from 'react'

const CanWriteContext = createContext<Promise<boolean>>(Promise.resolve(false))

type GateProps = {
    children: ReactNode
    fallback: ReactNode
}

export function CanWriteProvider({ value, children }: { value: Promise<boolean>; children: ReactNode }) {
    return <CanWriteContext value={value}>{children}</CanWriteContext>
}

export function useCanWrite() {
    return use(useContext(CanWriteContext))
}

function Gate({ children, fallback }: GateProps) {
    return useCanWrite() ? children : fallback
}

export function Editable({ children, fallback }: GateProps) {
    return (
        <Suspense fallback={fallback}>
            <Gate fallback={fallback}>{children}</Gate>
        </Suspense>
    )
}
