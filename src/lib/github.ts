export const ORG = 'bitoolkit';

const API = 'https://api.github.com';

export interface Repo {
  name: string;
  full_name: string;
  description: string | null;
  homepage: string | null;
  html_url: string;
  language: string | null;
  pushed_at: string;
  default_branch: string;
  fork: boolean;
  archived: boolean;
  private: boolean;
  license: { spdx_id: string | null } | null;
}

export interface Org {
  login: string;
  name: string | null;
  description: string | null;
  avatar_url: string;
  html_url: string;
}

export interface Readme {
  path: string;
  content: string;
}

export interface Release {
  tag_name: string;
  name: string | null;
  html_url: string;
  published_at: string;
  assets: { name: string; size: number; browser_download_url: string }[];
}

async function request(path: string, accept = 'application/vnd.github+json') {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  const response = await fetch(`${API}${path}`, {
    headers: {
      Accept: accept,
      'User-Agent': `${ORG}-website`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`GitHub API ${path} failed: ${response.status} ${await response.text()}`);
  }
  return response;
}

async function fetchRequired(path: string, accept?: string) {
  const response = await request(path, accept);
  if (!response) throw new Error(`GitHub API ${path} failed: 404`);
  return response;
}

export async function listRepos(): Promise<Repo[]> {
  return (await fetchRequired(`/orgs/${ORG}/repos?type=public&per_page=100`)).json();
}

export async function getOrg(): Promise<Org> {
  return (await fetchRequired(`/orgs/${ORG}`)).json();
}

export async function getProfileReadme(): Promise<string> {
  const path = `/repos/${ORG}/.github/contents/profile/README.md`;
  return (await fetchRequired(path, 'application/vnd.github.raw')).text();
}

export async function getReadme(repo: Repo): Promise<Readme | null> {
  const response = await request(`/repos/${repo.full_name}/readme`);
  if (!response) return null;
  const body: { path: string; content: string } = await response.json();
  return { path: body.path, content: Buffer.from(body.content, 'base64').toString('utf8') };
}

export async function getLatestRelease(repo: Repo): Promise<Release | null> {
  const response = await request(`/repos/${repo.full_name}/releases/latest`);
  return response && response.json();
}

export async function listFiles(repo: Repo): Promise<string[]> {
  const response = await request(`/repos/${repo.full_name}/git/trees/${repo.default_branch}?recursive=1`);
  if (!response) return [];
  const body: { tree: { path: string; type: string }[] } = await response.json();
  return body.tree.filter((entry) => entry.type === 'blob').map((entry) => entry.path);
}
