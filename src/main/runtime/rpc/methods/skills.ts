import { z } from 'zod'
import { defineMethod, type RpcMethod } from '../core'
import { discoverSkills } from '../../../skills/discovery'
import { checkOrcaSkillFreshness } from '../../../skills/freshness'

const SkillDiscoveryParams = z.object({
  cwd: z.string().optional().nullable()
})

export const SKILL_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'skills.discover',
    params: SkillDiscoveryParams,
    handler: async (params, { runtime }) => {
      const cwd = params.cwd?.trim() || undefined
      return cwd
        ? discoverSkills({ repos: [], cwd })
        : discoverSkills({ repos: runtime.listRepos() })
    }
  }),
  defineMethod({
    name: 'skills.checkFreshness',
    params: SkillDiscoveryParams,
    // Why: web/SSH paired clients hash the daemon host home only. WSL home
    // resolution stays on the desktop IPC path (Windows + wsl.exe).
    handler: async () => checkOrcaSkillFreshness({})
  })
]
