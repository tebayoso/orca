import { createHash } from 'node:crypto'
import { open, readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { ORCA_MANAGED_SKILLS } from '../../shared/orca-managed-skills'
import { ORCA_SKILL_REFERENCE_HASHES } from '../../shared/orca-skill-reference-hashes.generated'
import type {
  SkillFreshnessEntry,
  SkillFreshnessResult,
  SkillFreshnessStatus
} from '../../shared/skill-freshness'

const SKILL_FILE_NAME = 'SKILL.md'
const MAX_SKILL_MARKDOWN_BYTES = 256 * 1024

/**
 * Home provider skill directories that `npx skills add --global` writes into.
 * Why private to freshness: do not expand Skills-page discovery roots; only
 * probe managed skill basenames under these paths.
 */
const HOME_SKILL_DIR_SEGMENTS: readonly (readonly string[])[] = [
  ['.agents', 'skills'],
  ['.claude', 'skills'],
  ['.codex', 'skills'],
  ['.grok', 'skills'],
  ['.config', 'opencode', 'skills'],
  ['.pi', 'agent', 'skills'],
  ['.gemini', 'skills'],
  ['.gemini', 'antigravity', 'skills'],
  ['.cursor', 'skills']
]

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

type SkillFileHashOutcome =
  | { kind: 'missing' }
  | { kind: 'unreadable' }
  | { kind: 'ok'; hash: string }

async function inspectSkillFile(skillFilePath: string): Promise<SkillFileHashOutcome> {
  let file
  try {
    file = await open(skillFilePath, 'r')
  } catch {
    return { kind: 'missing' }
  }

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
      return { kind: 'unreadable' }
    }
    const content = buffer.toString('utf8', 0, totalBytesRead)
    return { kind: 'ok', hash: hashSkillMarkdown(content) }
  } catch {
    return { kind: 'unreadable' }
  } finally {
    await file.close()
  }
}

function loadCatalogExpectedHashes(): Map<string, string> {
  const hashes = new Map<string, string>()
  for (const [skillName, hash] of Object.entries(ORCA_SKILL_REFERENCE_HASHES)) {
    hashes.set(normalizeSkillName(skillName), hash)
  }
  return hashes
}

/**
 * Test-only override: load expected hashes from a temp skills tree.
 * Production always uses the generated catalog — never the repo skills/ tree.
 */
async function loadExpectedHashesFromRoot(referenceRoot: string): Promise<Map<string, string>> {
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
      const outcome = await inspectSkillFile(skillFilePath)
      if (outcome.kind === 'ok') {
        hashes.set(normalizeSkillName(entryName), outcome.hash)
      }
    })
  )
  return hashes
}

/** Resolve installed managed-skill paths under home provider skill roots only. */
function listManagedHomeSkillPaths(homeDir: string, skillName: string): string[] {
  return HOME_SKILL_DIR_SEGMENTS.map((segments) =>
    join(homeDir, ...segments, skillName, SKILL_FILE_NAME)
  )
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
  homeDir?: string
  /**
   * Optional temp skills root for unit tests. When omitted, expected hashes
   * come from ORCA_SKILL_REFERENCE_HASHES (no packaged skills/ tree).
   */
  referenceRoot?: string | null
}): Promise<SkillFreshnessResult> {
  // Why: never read process.resourcesPath/orca-skills or repo skills/ at runtime.
  const referenceRoot = args?.referenceRoot ?? null
  const expectedHashes =
    referenceRoot === null
      ? loadCatalogExpectedHashes()
      : await loadExpectedHashesFromRoot(referenceRoot)

  // Why: only probe known managed basenames under home skill roots — no repo/cwd
  // walks and no full skill-discovery scan (avoids mutating discovery sources).
  const homeDir = args?.homeDir ?? homedir()

  const skills = await Promise.all(
    ORCA_MANAGED_SKILLS.map(async (definition) => {
      const expectedHash = expectedHashes.get(normalizeSkillName(definition.skillName)) ?? null
      const candidatePaths = listManagedHomeSkillPaths(homeDir, definition.skillName)
      const inspected = await Promise.all(
        candidatePaths.map(async (skillFilePath) => ({
          path: skillFilePath,
          outcome: await inspectSkillFile(skillFilePath)
        }))
      )
      const installed = inspected.filter((entry) => entry.outcome.kind !== 'missing')
      const readable = inspected.filter(
        (entry): entry is { path: string; outcome: { kind: 'ok'; hash: string } } =>
          entry.outcome.kind === 'ok'
      )
      const diverging = readable.filter(
        (entry) => expectedHash !== null && entry.outcome.hash !== expectedHash
      )
      const primary = diverging[0] ?? readable[0]

      return {
        skillName: definition.skillName,
        displayName: definition.displayName,
        settingsSectionId: definition.settingsSectionId,
        updateCommand: definition.updateCommand,
        status: resolveStatus({
          expectedHash,
          installedCount: installed.length,
          readableCount: readable.length,
          divergingCount: diverging.length
        }),
        expectedHash,
        installedHash: primary?.outcome.hash ?? null,
        installedPath: primary?.path ?? installed[0]?.path ?? null,
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
