// GitHub 계정의 리포지토리/파일 트리를 읽는다(REST API, 읽기 전용).
const API = 'https://api.github.com'

export interface GitHubRepo {
  owner: string
  name: string
  fullName: string
  defaultBranch: string
  private: boolean
  fork: boolean
  description: string | null
  language: string | null
  htmlUrl: string
  updatedAt: string
}

export interface GitHubTreeEntry {
  path: string
  type: 'blob' | 'tree'
  size?: number
}

interface GhError extends Error {
  status?: number
}

async function gh(path: string, token: string): Promise<unknown> {
  const res = await fetch(`${API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  })
  if (!res.ok) {
    const err: GhError = new Error(`GitHub ${res.status}`)
    err.status = res.status
    throw err
  }
  return res.json()
}

// 토큰 유효성 확인 → 로그인명 반환(실패 시 null)
export async function checkToken(token: string): Promise<{ login: string } | null> {
  try {
    const u = (await gh('/user', token)) as { login: string }
    return { login: u.login }
  } catch {
    return null
  }
}

// 계정이 접근 가능한 모든 repo(소유/협업/조직), 최근 업데이트순
export async function listRepos(token: string): Promise<GitHubRepo[]> {
  const repos: GitHubRepo[] = []
  for (let page = 1; page <= 10; page++) {
    const data = (await gh(
      `/user/repos?per_page=100&sort=updated&page=${page}&affiliation=owner,collaborator,organization_member`,
      token
    )) as Array<Record<string, unknown>>
    if (!Array.isArray(data) || data.length === 0) break
    for (const r of data) {
      const owner = r.owner as { login?: string } | undefined
      repos.push({
        owner: owner?.login ?? '',
        name: String(r.name),
        fullName: String(r.full_name),
        defaultBranch: (r.default_branch as string) || 'main',
        private: !!r.private,
        fork: !!r.fork,
        description: (r.description as string) ?? null,
        language: (r.language as string) ?? null,
        htmlUrl: String(r.html_url),
        updatedAt: String(r.updated_at)
      })
    }
    if (data.length < 100) break
  }
  return repos
}

// repo의 전체 파일 트리(폴더+파일). 너무 크면 잘릴 수 있음(truncated).
export async function getRepoTree(
  token: string,
  owner: string,
  repo: string,
  branch: string
): Promise<GitHubTreeEntry[]> {
  const data = (await gh(`/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`, token)) as {
    tree?: Array<{ path: string; type: string; size?: number }>
  }
  const tree = Array.isArray(data.tree) ? data.tree : []
  return tree
    .filter((t) => t.type === 'blob' || t.type === 'tree')
    .map((t) => ({ path: t.path, type: t.type as 'blob' | 'tree', size: t.size }))
}
