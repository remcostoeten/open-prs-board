import { bitbucket } from '@/features/providers/bitbucket/adapter'
import { github } from '@/features/providers/github/adapter'
import { snapshot } from '@/features/providers/snapshot/adapter'
import type { ProviderAdapter, ProviderId } from '@/features/providers/types'

const ADAPTERS: Partial<Record<ProviderId, ProviderAdapter>> = { bitbucket, github, snapshot }

/**
 * @name registerAdapter
 * @description Installs or replaces the adapter for a provider id, so extra providers can be added without
 * touching the sync engine.
 *
 * @example
 * registerAdapter(gitlab)
 */
export function registerAdapter(adapter: ProviderAdapter) {
    ADAPTERS[adapter.id] = adapter
}

/**
 * @name getAdapter
 * @description Returns the adapter for a provider id, or null when that provider is not installed.
 *
 * @example
 * const adapter = getAdapter(repository.provider)
 */
export function getAdapter(provider: ProviderId): ProviderAdapter | null {
    return ADAPTERS[provider] ?? null
}
