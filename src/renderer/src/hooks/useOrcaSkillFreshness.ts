import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SkillDiscoveryTarget } from '../../../shared/skills'
import type { SkillFreshnessEntry, SkillFreshnessResult } from '../../../shared/skill-freshness'
import { useMountedRef } from './useMountedRef'

const INSTALLED_AGENT_SKILLS_CHANGED_EVENT = 'orca:installed-agent-skills-changed'
const FRESHNESS_CHANGED_EVENT = 'orca:skill-freshness-changed'

let cachedFreshness: SkillFreshnessResult | null = null
let pendingFreshness: Promise<SkillFreshnessResult> | null = null

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

export function notifyOrcaSkillFreshnessChanged(): void {
  cachedFreshness = null
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(FRESHNESS_CHANGED_EVENT))
  }
}

async function loadSkillFreshness(
  force: boolean,
  target?: SkillDiscoveryTarget
): Promise<SkillFreshnessResult> {
  if (!force && cachedFreshness) {
    return cachedFreshness
  }
  if (pendingFreshness) {
    return pendingFreshness
  }
  const request = window.api.skills
    .checkFreshness(target)
    .then((result) => {
      cachedFreshness = result
      return result
    })
    .finally(() => {
      if (pendingFreshness === request) {
        pendingFreshness = null
      }
    })
  pendingFreshness = request
  return request
}

export const _orcaSkillFreshnessInternalsForTests = {
  reset(): void {
    cachedFreshness = null
    pendingFreshness = null
  },
  setCached(result: SkillFreshnessResult | null): void {
    cachedFreshness = result
  }
}

export function useOrcaSkillFreshness(options?: {
  enabled?: boolean
  discoveryTarget?: SkillDiscoveryTarget
}): OrcaSkillFreshnessState {
  const enabled = options?.enabled ?? true
  const discoveryTarget = options?.discoveryTarget
  const mountedRef = useMountedRef()
  const [result, setResult] = useState<SkillFreshnessResult | null>(cachedFreshness)
  const [loading, setLoading] = useState(enabled && !cachedFreshness)
  const [error, setError] = useState<string | null>(null)
  const generationRef = useRef(0)

  const refresh = useCallback(async (): Promise<SkillFreshnessResult | null> => {
    const generation = ++generationRef.current
    if (!enabled) {
      if (mountedRef.current) {
        setLoading(false)
      }
      return null
    }
    if (mountedRef.current) {
      setLoading(true)
    }
    try {
      const next = await loadSkillFreshness(true, discoveryTarget)
      if (mountedRef.current && generation === generationRef.current) {
        setResult(next)
        setError(null)
      }
      return next
    } catch (refreshError) {
      if (mountedRef.current && generation === generationRef.current) {
        setError(
          refreshError instanceof Error ? refreshError.message : 'Could not check skill freshness.'
        )
      }
      return null
    } finally {
      if (mountedRef.current && generation === generationRef.current) {
        setLoading(false)
      }
    }
  }, [discoveryTarget, enabled, mountedRef])

  useEffect(() => {
    if (!enabled) {
      return
    }
    void refresh()
  }, [enabled, refresh])

  useEffect(() => {
    if (!enabled) {
      return
    }
    const onChange = (): void => {
      void refresh()
    }
    window.addEventListener('focus', onChange)
    window.addEventListener(INSTALLED_AGENT_SKILLS_CHANGED_EVENT, onChange)
    window.addEventListener(FRESHNESS_CHANGED_EVENT, onChange)
    return () => {
      window.removeEventListener('focus', onChange)
      window.removeEventListener(INSTALLED_AGENT_SKILLS_CHANGED_EVENT, onChange)
      window.removeEventListener(FRESHNESS_CHANGED_EVENT, onChange)
    }
  }, [enabled, refresh])

  const skills = useMemo(() => (enabled && result ? result.skills : []), [enabled, result])

  const outdatedSkills = useMemo(
    () => skills.filter((skill) => skill.status === 'outdated'),
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
