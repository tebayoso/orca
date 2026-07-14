import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SkillDiscoveryTarget } from '../../../shared/skills'
import type { SkillFreshnessEntry, SkillFreshnessResult } from '../../../shared/skill-freshness'
import { shouldPromptOutdatedSkill } from '@/components/skills/outdated-skill-reminder'
import { useMountedRef } from './useMountedRef'

const INSTALLED_AGENT_SKILLS_CHANGED_EVENT = 'orca:installed-agent-skills-changed'

let cachedFreshnessByTarget = new Map<string, SkillFreshnessResult>()
let pendingFreshnessByTarget = new Map<string, Promise<SkillFreshnessResult>>()
// Why (M3): every Settings panel mounts this hook and focus-fires refresh.
// Coalesce forced loads per target so one focus event is one scan.
let forcedFreshnessByTarget = new Map<string, Promise<SkillFreshnessResult>>()

export type OrcaSkillFreshnessState = {
  loading: boolean
  error: string | null
  skills: readonly SkillFreshnessEntry[]
  outdatedSkills: readonly SkillFreshnessEntry[]
  refresh: () => Promise<SkillFreshnessResult | null>
  isSkillOutdated: (skillName: string) => boolean
  getSkillEntry: (skillName: string) => SkillFreshnessEntry | undefined
}

function normalizeSkillName(value: string): string {
  return value.trim().toLowerCase()
}

/**
 * Why: backend freshness ignores cwd and only scans home roots. Key by WSL vs
 * host runtime only so project switches do not duplicate identical scans.
 */
function getSkillDiscoveryTargetKey(target: SkillDiscoveryTarget | undefined): string {
  if (target?.projectRuntime) {
    if (
      target.projectRuntime.status === 'resolved' &&
      target.projectRuntime.runtime.kind === 'wsl'
    ) {
      return `wsl:${target.projectRuntime.runtime.distro}`
    }
    if (target.projectRuntime.status === 'repair-required') {
      return `repair:${target.projectRuntime.repair.cacheKey}`
    }
    return 'host'
  }
  if (target?.runtime === 'wsl') {
    return `wsl:${target.wslDistro?.trim() ?? ''}`
  }
  return 'host'
}

function isRepairRequiredTarget(target: SkillDiscoveryTarget | undefined): boolean {
  return target?.projectRuntime?.status === 'repair-required'
}

async function startFreshnessRequest(
  key: string,
  target?: SkillDiscoveryTarget
): Promise<SkillFreshnessResult> {
  const request = window.api.skills
    .checkFreshness(target)
    .then((result) => {
      cachedFreshnessByTarget.set(key, result)
      return result
    })
    .finally(() => {
      if (pendingFreshnessByTarget.get(key) === request) {
        pendingFreshnessByTarget.delete(key)
      }
    })
  pendingFreshnessByTarget.set(key, request)
  return request
}

async function loadSkillFreshness(
  force: boolean,
  target?: SkillDiscoveryTarget
): Promise<SkillFreshnessResult> {
  const key = getSkillDiscoveryTargetKey(target)

  if (!force) {
    const cached = cachedFreshnessByTarget.get(key)
    if (cached) {
      return cached
    }
    const inFlight = pendingFreshnessByTarget.get(key)
    if (inFlight) {
      return inFlight
    }
    return startFreshnessRequest(key, target)
  }

  const existingForced = forcedFreshnessByTarget.get(key)
  if (existingForced) {
    return existingForced
  }

  const forced = (async () => {
    const inFlight = pendingFreshnessByTarget.get(key)
    if (inFlight) {
      try {
        await inFlight
      } catch {
        // Previous failure should not block an explicit re-check.
      }
    }
    return startFreshnessRequest(key, target)
  })().finally(() => {
    if (forcedFreshnessByTarget.get(key) === forced) {
      forcedFreshnessByTarget.delete(key)
    }
  })

  forcedFreshnessByTarget.set(key, forced)
  return forced
}

export const _orcaSkillFreshnessInternalsForTests = {
  reset(): void {
    cachedFreshnessByTarget = new Map()
    pendingFreshnessByTarget = new Map()
    forcedFreshnessByTarget = new Map()
  },
  setCached(result: SkillFreshnessResult | null, targetKey = 'host'): void {
    if (result) {
      cachedFreshnessByTarget.set(targetKey, result)
    } else {
      cachedFreshnessByTarget.clear()
    }
  }
}

export function useOrcaSkillFreshness(options?: {
  enabled?: boolean
  discoveryTarget?: SkillDiscoveryTarget
}): OrcaSkillFreshnessState {
  const enabled = options?.enabled ?? true
  const discoveryTarget = options?.discoveryTarget
  const discoveryTargetKey = getSkillDiscoveryTargetKey(discoveryTarget)
  const mountedRef = useMountedRef()
  const cachedDiscovery = cachedFreshnessByTarget.get(discoveryTargetKey) ?? null
  const [result, setResult] = useState<SkillFreshnessResult | null>(cachedDiscovery)
  const [loading, setLoading] = useState(enabled && !cachedDiscovery)
  const [error, setError] = useState<string | null>(null)
  const generationRef = useRef(0)
  const currentTargetKeyRef = useRef(discoveryTargetKey)
  const stateResetInputRef = useRef({ discoveryTargetKey, enabled })
  // Why: host→WSL (or project runtime) switches must not keep the previous
  // target's result while the new scan is in flight (CodeRabbit).
  if (
    stateResetInputRef.current.discoveryTargetKey !== discoveryTargetKey ||
    stateResetInputRef.current.enabled !== enabled
  ) {
    const nextCached = cachedFreshnessByTarget.get(discoveryTargetKey) ?? null
    const nextLoading = enabled && !isRepairRequiredTarget(discoveryTarget) && !nextCached
    stateResetInputRef.current = { discoveryTargetKey, enabled }
    currentTargetKeyRef.current = discoveryTargetKey
    if (result !== nextCached) {
      setResult(nextCached)
    }
    if (loading !== nextLoading) {
      setLoading(nextLoading)
    }
    if (error !== null) {
      setError(null)
    }
  } else {
    currentTargetKeyRef.current = discoveryTargetKey
  }

  const refresh = useCallback(async (): Promise<SkillFreshnessResult | null> => {
    const generation = ++generationRef.current
    const requestTargetKey = discoveryTargetKey
    if (!enabled || isRepairRequiredTarget(discoveryTarget)) {
      if (mountedRef.current) {
        setLoading(false)
        if (isRepairRequiredTarget(discoveryTarget)) {
          setResult(null)
          setError(null)
        }
      }
      return null
    }
    if (mountedRef.current) {
      setLoading(true)
    }
    try {
      const next = await loadSkillFreshness(true, discoveryTarget)
      if (
        mountedRef.current &&
        generation === generationRef.current &&
        currentTargetKeyRef.current === requestTargetKey
      ) {
        setResult(next)
        setError(null)
      }
      return next
    } catch (refreshError) {
      if (
        mountedRef.current &&
        generation === generationRef.current &&
        currentTargetKeyRef.current === requestTargetKey
      ) {
        setError(
          refreshError instanceof Error ? refreshError.message : 'Could not check skill freshness.'
        )
      }
      return null
    } finally {
      if (
        mountedRef.current &&
        generation === generationRef.current &&
        currentTargetKeyRef.current === requestTargetKey
      ) {
        setLoading(false)
      }
    }
  }, [discoveryTarget, discoveryTargetKey, enabled, mountedRef])

  useEffect(() => {
    if (!enabled || isRepairRequiredTarget(discoveryTarget)) {
      if (mountedRef.current) {
        setLoading(false)
        if (isRepairRequiredTarget(discoveryTarget)) {
          setResult(null)
          setError(null)
        }
      }
      return
    }
    void loadSkillFreshness(false, discoveryTarget)
      .then((next) => {
        if (mountedRef.current && currentTargetKeyRef.current === discoveryTargetKey) {
          setResult(next)
          setError(null)
          setLoading(false)
        }
      })
      .catch((refreshError: unknown) => {
        if (mountedRef.current && currentTargetKeyRef.current === discoveryTargetKey) {
          setError(
            refreshError instanceof Error
              ? refreshError.message
              : 'Could not check skill freshness.'
          )
          setLoading(false)
        }
      })
  }, [discoveryTarget, discoveryTargetKey, enabled, mountedRef])

  useEffect(() => {
    if (!enabled) {
      return
    }
    const onChange = (): void => {
      void refresh()
    }
    window.addEventListener('focus', onChange)
    window.addEventListener(INSTALLED_AGENT_SKILLS_CHANGED_EVENT, onChange)
    return () => {
      window.removeEventListener('focus', onChange)
      window.removeEventListener(INSTALLED_AGENT_SKILLS_CHANGED_EVENT, onChange)
    }
  }, [enabled, refresh])

  const skills = useMemo(() => (enabled && result ? result.skills : []), [enabled, result])

  const outdatedSkills = useMemo(
    () => skills.filter((skill) => skill.status === 'outdated' && shouldPromptOutdatedSkill(skill)),
    [skills]
  )

  const isSkillOutdated = useCallback(
    (skillName: string): boolean => {
      const expected = normalizeSkillName(skillName)
      return outdatedSkills.some((skill) => normalizeSkillName(skill.skillName) === expected)
    },
    [outdatedSkills]
  )

  const getSkillEntry = useCallback(
    (skillName: string): SkillFreshnessEntry | undefined => {
      const expected = normalizeSkillName(skillName)
      return skills.find((skill) => normalizeSkillName(skill.skillName) === expected)
    },
    [skills]
  )

  return {
    loading,
    error,
    skills,
    outdatedSkills,
    refresh,
    isSkillOutdated,
    getSkillEntry
  }
}
