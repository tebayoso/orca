import { createHash } from 'node:crypto'
import { open, readdir, stat } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
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

function basenameFromPath(pathValue: string): string {
  return pathValue.split(/[\\/]/).filter(Boolean).at(-1) ?? pathValue
}

/** Normalize line endings so macOS/Windows installs hash the same content. */
export function normalizeSkillMarkdownForHash(content: string): string {
  return content.replace(/\r\n/g, '\n')
}

export function hashSkillMarkdown(content: string): string {
  return createHash('sha256').update(normalizeSkillMarkdownForHash(content), 'utf8').digest('hex')
}

async function readSkillMarkdown(skillFilePath: string): Promise<string | null> {
  try {
    const fileStat = await stat(skillFilePath)
    const file = await open(skillFilePath, 'r')
    try {
      const buffer = Buffer.alloc(Math.min(fileStat.size, MAX_SKILL_MARKDOWN_BYTES))
      const { bytesRead } = await file.read(buffer, 0, buffer.length, 0)
      return buffer.toString('utf8', 0, bytesRead)
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
    normalizeSkillName(basenameFromPath(skill.directoryPath)) === expected
  )
}

function pickInstalledGlobalSkill(
  skills: readonly DiscoveredSkill[],
  skillName: string
): DiscoveredSkill | null {
  // Prefer home installs so repo/plugin copies do not mask the global package.
  // Match only this skill's package name — aliases are install-time synonyms
  // (e.g. Linear), not interchangeable content for hash comparison.
  const homeMatch = skills.find(
    (skill) =>
      skill.installed && skill.sourceKind === 'home' && skillMatchesManagedName(skill, skillName)
  )
  if (homeMatch) {
    return homeMatch
  }
  return (
    skills.find((skill) => skill.installed && skillMatchesManagedName(skill, skillName)) ?? null
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
  installedHash: string | null
}): SkillFreshnessStatus {
  if (!args.expectedHash) {
    return 'unknown'
  }
  if (!args.installedHash) {
    return 'missing'
  }
  return args.expectedHash === args.installedHash ? 'current' : 'outdated'
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

  const discovery = await discoverSkills({
    repos: args?.repos ?? [],
    homeDir: args?.homeDir,
    cwd: args?.cwd
  })

  const skills: SkillFreshnessEntry[] = []
  for (const definition of ORCA_MANAGED_SKILLS) {
    const expectedHash = expectedHashes.get(normalizeSkillName(definition.skillName)) ?? null
    const installed = pickInstalledGlobalSkill(discovery.skills, definition.skillName)
    const installedHash = installed ? await hashSkillFile(installed.skillFilePath) : null
    skills.push({
      skillName: definition.skillName,
      displayName: definition.displayName,
      settingsSectionId: definition.settingsSectionId,
      updateCommand: definition.updateCommand,
      status: resolveStatus({ expectedHash, installedHash }),
      expectedHash,
      installedHash,
      installedPath: installed?.skillFilePath ?? null
    })
  }

  return {
    skills,
    scannedAt: Date.now(),
    referenceRoot
  }
}

/** Test helper: hash a path under a reference skills root. */
export function referenceSkillFilePath(referenceRoot: string, skillName: string): string {
  return join(referenceRoot, basename(skillName), SKILL_FILE_NAME)
}

export function referenceSkillDirectory(referenceRoot: string, skillName: string): string {
  return dirname(referenceSkillFilePath(referenceRoot, skillName))
}
