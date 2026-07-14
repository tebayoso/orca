// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SkillDiscoveryTarget } from '../../../shared/skills'
import type { SkillFreshnessEntry, SkillFreshnessResult } from '../../../shared/skill-freshness'
import {
  _orcaSkillFreshnessInternalsForTests,
  type OrcaSkillFreshnessState,
  useOrcaSkillFreshness
} from './useOrcaSkillFreshness'

let root: Root | null = null
let container: HTMLDivElement | null = null
let latestState: OrcaSkillFreshnessState | null = null

function entry(overrides: Partial<SkillFreshnessEntry>): SkillFreshnessEntry {
  return {
    skillName: 'orca-cli',
    displayName: 'Orca CLI',
    settingsSectionId: 'general',
    updateCommand: 'npx skills update orca-cli --global',
    status: 'outdated',
    expectedHash: 'abc',
    installedHash: 'def',
    installedPath: '/home/test/.agents/skills/orca-cli/SKILL.md',
    divergingPaths: ['/home/test/.agents/skills/orca-cli/SKILL.md'],
    ...overrides
  }
}

function freshnessResult(skills: SkillFreshnessEntry[] = []): SkillFreshnessResult {
  return {
    skills,
    scannedAt: Date.now(),
    referenceRoot: null
  }
}

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function Probe({ discoveryTarget }: { discoveryTarget?: SkillDiscoveryTarget }): null {
  latestState = useOrcaSkillFreshness({ discoveryTarget })
  return null
}

async function renderProbe(discoveryTarget?: SkillDiscoveryTarget): Promise<void> {
  if (!container) {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  }
  await act(async () => {
    root?.render(<Probe discoveryTarget={discoveryTarget} />)
  })
}

function stubSkillsApi(
  checkFreshness: (target?: SkillDiscoveryTarget) => Promise<SkillFreshnessResult>
): void {
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { skills: { checkFreshness } }
  })
}

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount()
    })
    root = null
  }
  container?.remove()
  container = null
  latestState = null
  _orcaSkillFreshnessInternalsForTests.reset()
  vi.restoreAllMocks()
  Reflect.deleteProperty(window, 'api')
})

describe('useOrcaSkillFreshness', () => {
  it('loads host freshness and exposes outdated skills', async () => {
    const result = freshnessResult([entry({})])
    const checkFreshness = vi.fn().mockResolvedValue(result)
    stubSkillsApi(checkFreshness)

    await renderProbe()
    await act(async () => {
      await Promise.resolve()
    })

    expect(checkFreshness).toHaveBeenCalledTimes(1)
    expect(latestState?.loading).toBe(false)
    expect(latestState?.outdatedSkills.map((skill) => skill.skillName)).toEqual(['orca-cli'])
    expect(latestState?.isSkillOutdated('orca-cli')).toBe(true)
  })

  it('reseeds state when discovery target switches host → WSL', async () => {
    const hostResult = freshnessResult([
      entry({ skillName: 'orca-cli', status: 'outdated', expectedHash: 'host' })
    ])
    const wslResult = freshnessResult([
      entry({
        skillName: 'orca-cli',
        status: 'current',
        expectedHash: 'wsl',
        installedHash: 'wsl',
        divergingPaths: []
      })
    ])
    const checkFreshness = vi
      .fn()
      .mockResolvedValueOnce(hostResult)
      .mockResolvedValueOnce(wslResult)
    stubSkillsApi(checkFreshness)

    await renderProbe()
    await act(async () => {
      await Promise.resolve()
    })
    expect(latestState?.isSkillOutdated('orca-cli')).toBe(true)

    await renderProbe({ runtime: 'wsl', wslDistro: 'Ubuntu' })
    await act(async () => {
      await Promise.resolve()
    })

    expect(checkFreshness).toHaveBeenCalledTimes(2)
    expect(latestState?.isSkillOutdated('orca-cli')).toBe(false)
    expect(latestState?.getSkillEntry('orca-cli')?.status).toBe('current')
  })

  it('coalesces concurrent forced refreshes for the same target', async () => {
    const initial = deferred<SkillFreshnessResult>()
    const forced = deferred<SkillFreshnessResult>()
    const checkFreshness = vi
      .fn()
      .mockReturnValueOnce(initial.promise)
      .mockReturnValueOnce(forced.promise)
    stubSkillsApi(checkFreshness)

    await renderProbe()
    expect(checkFreshness).toHaveBeenCalledTimes(1)

    const first = latestState?.refresh()
    const second = latestState?.refresh()
    // Forced path waits on the initial in-flight scan; no extra call yet.
    expect(checkFreshness).toHaveBeenCalledTimes(1)

    initial.resolve(freshnessResult([entry({})]))
    await act(async () => {
      await Promise.resolve()
    })
    // One shared forced scan after the initial settles.
    expect(checkFreshness).toHaveBeenCalledTimes(2)

    forced.resolve(
      freshnessResult([entry({ status: 'current', installedHash: 'abc', divergingPaths: [] })])
    )
    await act(async () => {
      await first
      await second
    })
    expect(latestState?.isSkillOutdated('orca-cli')).toBe(false)
  })

  it('skips scans for repair-required project runtimes', async () => {
    const checkFreshness = vi.fn()
    stubSkillsApi(checkFreshness)

    await renderProbe({
      projectRuntime: {
        status: 'repair-required',
        repair: {
          projectId: 'repo-1',
          preferredRuntime: { kind: 'wsl', distro: null },
          reason: 'wsl-distro-required',
          source: 'project-override',
          cacheKey: 'repo:repair'
        }
      }
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(checkFreshness).not.toHaveBeenCalled()
    expect(latestState?.loading).toBe(false)
    expect(latestState?.skills).toEqual([])
  })
})
