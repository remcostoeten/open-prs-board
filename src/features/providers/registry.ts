import { bitbucket } from '@/features/providers/bitbucket/adapter'
import { snapshot } from '@/features/providers/snapshot/adapter'
import type { ProviderAdapter, ProviderId } from '@/features/providers/types'

const ADAPTERS: Partial<Record<ProviderId, ProviderAdapter>> = { bitbucket, snapshot }

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
