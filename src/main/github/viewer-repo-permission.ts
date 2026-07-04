import type { GitHubViewerRepoPermission, IssueSourcePreference } from '../../shared/types'
import type { LocalGitExecOptions, OwnerRepo } from './gh-utils'
// prettier-ignore
import { ghExecFileAsync, acquire, release, resolveIssueSource, ghRepoExecOptions, githubRepoContext } from './gh-utils'

const VALID_SLUG_SEGMENT = /^[A-Za-z0-9_.-]+$/

/**
 * Highest permission the authenticated viewer holds on the repo that issue
 * mutations for `repoPath` would target (or an explicit owner/repo override
 * for Project-origin rows).
 *
 * Why: the item dialog offers state/label/assignee mutations, but on repos
 * where the viewer can only read/comment (typical for upstreams of forks)
 * those writes are guaranteed 403s. Resolution mirrors `updateIssue` so the
 * permission always describes the repo the write would actually hit.
 * Returns null on any failure — callers fail open and keep the controls.
 */
export async function getViewerRepoPermission(
  repoPath: string,
  preference?: IssueSourcePreference,
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {},
  overrideOwnerRepo?: OwnerRepo | null
): Promise<{ permission: GitHubViewerRepoPermission; source: OwnerRepo } | null> {
  const ownerRepo =
    overrideOwnerRepo ??
    (await resolveIssueSource(repoPath, preference, connectionId, localGitOptions)).source
  if (
    !ownerRepo ||
    !VALID_SLUG_SEGMENT.test(ownerRepo.owner) ||
    !VALID_SLUG_SEGMENT.test(ownerRepo.repo)
  ) {
    return null
  }
  const ghOptions = ghRepoExecOptions(githubRepoContext(repoPath, connectionId, localGitOptions))
  await acquire()
  try {
    const { stdout } = await ghExecFileAsync(
      ['api', '--cache', '300s', `repos/${ownerRepo.owner}/${ownerRepo.repo}`],
      ghOptions
    )
    const data = JSON.parse(stdout) as {
      permissions?: { admin?: boolean; maintain?: boolean; push?: boolean; triage?: boolean }
    }
    const flags = data.permissions
    const permission: GitHubViewerRepoPermission = flags?.admin
      ? 'admin'
      : flags?.maintain
        ? 'maintain'
        : flags?.push
          ? 'write'
          : flags?.triage
            ? 'triage'
            : 'read'
    return { permission, source: ownerRepo }
  } catch {
    return null
  } finally {
    release()
  }
}
