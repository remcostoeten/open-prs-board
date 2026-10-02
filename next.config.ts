import type { NextConfig } from 'next'

const config: NextConfig = {
    reactCompiler: true,
    cacheComponents: true,
    typedRoutes: true,
    turbopack: { root: import.meta.dirname },
    experimental: {
        inlineCss: true,
    },
}

export default config
