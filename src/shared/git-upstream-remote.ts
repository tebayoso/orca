import {
  remoteExists,
  remoteMatchesExpectedUpstream,
  validateGitForkSyncExpectedUpstream,
  type GitForkSyncExpectedUpstream,
  type GitForkSyncRunner
} from './git-fork-sync'

const DEFAULT_ORIGIN_REMOTE = 'origin'
const DEFAULT_UPSTREAM_REMOTE = 'upstream'

export type GitAddUpstreamRemoteResult =
  | { ok: true; url: string; alreadyExisted: boolean }
  | {
      ok: false
      reason: 'missing-origin' | 'upstream-exists-mismatch' | 'add-failed'
      message?: string
    }

/**
 * Add an `upstream` remote pointing at the fork parent.
 *
 * Why: fork clones frequently lack an upstream remote, which blocks both
 * fork-sync (`missing-upstream`) and upstream issue-source resolution in the
 * tasks view. The transport mirrors origin's (SSH vs HTTPS) so existing
 * credentials keep working. Idempotent when upstream already matches the
 * expected slug; refuses to touch an upstream pointing elsewhere.
 */
export async function addUpstreamRemote(
  runGit: GitForkSyncRunner,
  expectedUpstream: GitForkSyncExpectedUpstream,
  options: { originRemote?: string; upstreamRemote?: string } = {}
): Promise<GitAddUpstreamRemoteResult> {
  const originRemote = options.originRemote ?? DEFAULT_ORIGIN_REMOTE
  const upstreamRemote = options.upstreamRemote ?? DEFAULT_UPSTREAM_REMOTE
  const expected = validateGitForkSyncExpectedUpstream(expectedUpstream, { required: true })

  if (await remoteExists(runGit, upstreamRemote)) {
    if (await remoteMatchesExpectedUpstream(runGit, upstreamRemote, expected)) {
      return { ok: true, url: '', alreadyExisted: true }
    }
    return { ok: false, reason: 'upstream-exists-mismatch' }
  }
  if (!(await remoteExists(runGit, originRemote))) {
    return { ok: false, reason: 'missing-origin' }
  }

  let originUrl = ''
  try {
    originUrl = (await runGit(['remote', 'get-url', originRemote])).stdout.trim()
  } catch {
    return { ok: false, reason: 'missing-origin' }
  }
  const useSsh = /^git@|^ssh:\/\//i.test(originUrl)
  const url = useSsh
    ? `git@github.com:${expected.owner}/${expected.repo}.git`
    : `https://github.com/${expected.owner}/${expected.repo}.git`
  try {
    await runGit(['remote', 'add', upstreamRemote, url])
    return { ok: true, url, alreadyExisted: false }
  } catch (error) {
    return {
      ok: false,
      reason: 'add-failed',
      message: error instanceof Error ? error.message : String(error)
    }
  }
}
