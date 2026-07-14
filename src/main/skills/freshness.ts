import { createHash } from 'node:crypto'
import { open, readdir } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { ORCA_MANAGED_SKILLS } from '../../shared/orca-managed-skills'
import type {
  SkillFreshnessEntry,
  SkillFreshnessResult,
  SkillFreshnessStatus
} from '../../shared/skill-freshness'
import { discoverSkills } from './discovery'
import { resolveBundledSkillsRoot } from './bundled-skills-root'
import type { DiscoveredSkill } from '../../shared/skills'
import type { Repo } from '../../shared/types'

const SKILL_FILE_NAME = 'SKILL.md'
const MAX_SKILL_MARKDOWN_BYTES = 256 * 1024

function normalizeSkillName(value: string): string {
  return value.trim().toLowerCase()
}

/** Normalize line endings so macOS/Windows installs hash the same content. */
export function normalizeSkillMarkdownForHash(content: string): string {
  // Why: strip a leading UTF-8 BOM so Windows-written skills still match.
  return content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
}

export function hashSkillMarkdown(content: string): string {
  return createHash('sha256').update(normalizeSkillMarkdownForHash(content), 'utf8').digest('hex')
}

async function readSkillMarkdown(skillFilePath: string): Promise<string | null> {
  try {
    const file = await open(skillFilePath, 'r')
    try {
      // Why: FileHandle.read may return short reads; loop to EOF. Cap at
      // MAX+1 so oversized skills are rejected instead of prefix-hashed.
      const buffer = Buffer.alloc(MAX_SKILL_MARKDOWN_BYTES + 1)
      let totalBytesRead = 0
      while (totalBytesRead < buffer.length) {
        const { bytesRead } = await file.read(
          buffer,
          totalBytesRead,
          buffer.length - totalBytesRead,
          totalBytesRead
        )
        if (bytesRead === 0) {
          break
        }
        totalBytesRead += bytesRead
      }
      if (totalBytesRead > MAX_SKILL_MARKDOWN_BYTES) {
        return null
      }
      return buffer.toString('utf8', 0, totalBytesRead)
    } finally {
      await file.close()
    }
  } catch {
    return null
  }
}

async function hashSkillFile(skillFilePath: string): Promise<string | null> {
  const content = await readSkillMarkdown(skillFilePath)
  return content === null ? null : hashSkillMarkdown(content)
}

function skillMatchesManagedName(skill: DiscoveredSkill, skillName: string): boolean {
  const expected = normalizeSkillName(skillName)
  return (
    normalizeSkillName(skill.name) === expected ||
    normalizeSkillName(basename(skill.directoryPath)) === expected
  )
}

function listInstalledHomeSkills(
  skills: readonly DiscoveredSkill[],
  skillName: string
): DiscoveredSkill[] {
  // Why: `npx skills add --global` writes into each agent's home skills dir
  // (~/.agents, ~/.claude, ~/.codex, …). Any diverging home copy must count.
  return skills.filter(
    (skill) =>
      skill.installed && skill.sourceKind === 'home' && skillMatchesManagedName(skill, skillName)
  )
}

async function loadExpectedHashes(referenceRoot: string): Promise<Map<string, string>> {
  const hashes = new Map<string, string>()
  let entries: string[] = []
  try {
    entries = await readdir(referenceRoot)
  } catch {
    return hashes
  }

  await Promise.all(
    entries.map(async (entryName) => {
      const skillFilePath = join(referenceRoot, entryName, SKILL_FILE_NAME)
      const hash = await hashSkillFile(skillFilePath)
      if (hash) {
        hashes.set(normalizeSkillName(entryName), hash)
      }
    })
  )
  return hashes
}

function resolveStatus(args: {
  expectedHash: string | null
  installedCount: number
  readableCount: number
  divergingCount: number
}): SkillFreshnessStatus {
  if (!args.expectedHash) {
    return 'unknown'
  }
  if (args.installedCount === 0) {
    return 'missing'
  }
  // Why: present-but-unreadable must not drive install UX.
  if (args.readableCount === 0) {
    return 'unknown'
  }
  if (args.divergingCount > 0) {
    return 'outdated'
  }
  return 'current'
}

export async function checkOrcaSkillFreshness(args?: {
  repos?: Repo[]
  homeDir?: string
  cwd?: string
  referenceRoot?: string | null
}): Promise<SkillFreshnessResult> {
  const referenceRoot =
    args?.referenceRoot === undefined ? resolveBundledSkillsRoot() : args.referenceRoot
  const expectedHashes = referenceRoot ? await loadExpectedHashes(referenceRoot) : new Map()

  // Why: freshness only cares about home installs. Skip repo/cwd walks.
  const discovery = await discoverSkills({
    repos: [],
    homeDir: args?.homeDir,
    includeProjectRoots: false
  })

  const skills = await Promise.all(
    ORCA_MANAGED_SKILLS.map(async (definition) => {
      const expectedHash = expectedHashes.get(normalizeSkillName(definition.skillName)) ?? null
      const homeInstalls = listInstalledHomeSkills(discovery.skills, definition.skillName)
      const hashed = await Promise.all(
        homeInstalls.map(async (install) => ({
          path: install.skillFilePath,
          hash: await hashSkillFile(install.skillFilePath)
        }))
      )
      const readable = hashed.filter((entry) => entry.hash !== null)
      const diverging = readable.filter(
        (entry) => expectedHash !== null && entry.hash !== expectedHash
      )
      const primary = diverging[0] ??
        readable[0] ?? { path: homeInstalls[0]?.skillFilePath ?? null, hash: null }

      return {
        skillName: definition.skillName,
        displayName: definition.displayName,
        settingsSectionId: definition.settingsSectionId,
        updateCommand: definition.updateCommand,
        status: resolveStatus({
          expectedHash,
          installedCount: homeInstalls.length,
          readableCount: readable.length,
          divergingCount: diverging.length
        }),
        expectedHash,
        installedHash: primary.hash,
        installedPath: primary.path,
        divergingPaths: diverging.map((entry) => entry.path)
      } satisfies SkillFreshnessEntry
    })
  )

  return {
    skills,
    scannedAt: Date.now(),
    referenceRoot
  }
}
