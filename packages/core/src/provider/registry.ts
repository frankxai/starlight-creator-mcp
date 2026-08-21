import type { Task } from '../types.js'
import type { Provider } from './interface.js'

export class ProviderRegistry {
  private readonly providers = new Map<string, Provider>()

  register(provider: Provider): void {
    if (this.providers.has(provider.id)) throw new Error(`provider ${provider.id} already registered`)
    this.providers.set(provider.id, provider)
  }

  get(id: string): Provider {
    const p = this.providers.get(id)
    if (!p) throw new Error(`unknown provider ${id}; registered: ${[...this.providers.keys()].join(', ') || 'none'}`)
    return p
  }

  has(id: string): boolean { return this.providers.has(id) }

  all(): Provider[] { return [...this.providers.values()] }

  forTask(task: Task): Provider[] { return this.all().filter(p => p.capabilities().includes(task)) }

  allowedHosts(): string[] { return [...new Set(this.all().flatMap(p => p.allowHosts))] }
}
