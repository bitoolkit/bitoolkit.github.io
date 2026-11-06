import type { Loader } from 'astro/loaders';
import type { Element, ElementContent, Root } from 'hast';
import { markdownToHast } from 'satteri';
import { BRAND_ACCENT, accentFromImage } from './color';
import {
  ORG,
  getLatestRelease,
  getOrg,
  getProfileReadme,
  getReadme,
  listFiles,
  listRepos,
  type Repo,
} from './github';

const ICON = /(^|\/)(icon|logo|favicon)\.(svg|png)$/i;
const COVER = /(^|\/)(poster|cover|preview|screenshot)[^/]*\.(png|jpe?g|webp)$/i;
const IGNORED_DIR = /(^|\/)(node_modules|test|tests|fixtures)\//;
const HIDDEN_ASSET = /-update\.json$/i;
const PINNED_PROJECTS = ['yanhekit', 'bitree'];

function normalizeUrl(url: string) {
  const parsed = new URL(/^https?:/.test(url) ? url : `https://${url}`);
  return `${parsed.host}${parsed.pathname.replace(/\/?$/, '/')}`.toLowerCase();
}

function externalWebsite(repo: Repo, site: string) {
  if (!repo.homepage) return undefined;
  const page = `${repo.name.toLowerCase()}/`;
  const ownPages = [`${ORG}.github.io/${page}`, normalizeUrl(new URL(page, site).href)];
  if (ownPages.includes(normalizeUrl(repo.homepage))) return undefined;
  return new URL(/^https?:/.test(repo.homepage) ? repo.homepage : `https://${repo.homepage}`).href;
}

interface ProfileProject {
  name: string;
  summary: string;
}

interface Profile {
  title?: string;
  tagline?: string;
  description?: string;
  disclaimer?: string;
  community?: string;
  projects: Map<string, ProfileProject>;
}

function elements(node: Root | Element, tagName: string): Element[] {
  return node.children
    .filter((child): child is Element => child.type === 'element')
    .flatMap((child) => [...(child.tagName === tagName ? [child] : []), ...elements(child, tagName)]);
}

function text(node: ElementContent | Root | undefined): string {
  if (!node) return '';
  if (node.type === 'text') return node.value;
  return 'children' in node ? node.children.map((child) => text(child as ElementContent)).join('') : '';
}

function repoName(href: string) {
  const match = href.match(/^https:\/\/github\.com\/([^/]+)\/([^/?#]+)\/?$/i);
  return match && match[1].toLowerCase() === ORG ? match[2].toLowerCase() : undefined;
}

let profile: Promise<Profile> | undefined;

function loadProfile() {
  profile ??= getProfileReadme().then((markdown) => {
    const tree = markdownToHast(markdown, { features: { rawHtml: true, gfm: true } }) as Root;
    const projects = new Map<string, ProfileProject>();
    for (const row of elements(tree, 'tr')) {
      const [nameCell, summaryCell] = elements(row, 'td');
      const link = nameCell && elements(nameCell, 'a')[0];
      const name = link && repoName(String(link.properties.href));
      if (name) projects.set(name, { name: text(link).trim(), summary: text(summaryCell).trim() });
    }
    const community = elements(tree, 'a')
      .map((link) => String(link.properties.href))
      .find((href) => href.startsWith('https://qm.qq.com/'));
    const paragraphs = elements(tree, 'p').map((node) => text(node).trim()).filter(Boolean);
    return {
      title: text(elements(tree, 'h1')[0]).trim() || undefined,
      tagline: paragraphs[0],
      description: paragraphs[1],
      disclaimer: text(elements(tree, 'h3')[0]).trim() || undefined,
      community,
      projects,
    };
  });
  return profile;
}

export function orgLoader(): Loader {
  return {
    name: 'bitoolkit-org',
    async load({ store, parseData }) {
      const [org, { title, tagline, description, disclaimer, community }] = await Promise.all([
        getOrg(),
        loadProfile(),
      ]);
      const data = await parseData({
        id: ORG,
        data: {
          title: title ?? org.name ?? org.login,
          tagline: tagline ?? org.description ?? undefined,
          description,
          disclaimer,
          avatar: org.avatar_url,
          url: org.html_url,
          community,
        },
      });
      store.clear();
      store.set({ id: ORG, data });
    },
  };
}

function pickFile(files: string[], pattern: RegExp) {
  return files
    .filter((file) => pattern.test(file) && !IGNORED_DIR.test(file))
    .sort((a, b) => a.split('/').length - b.split('/').length || Number(b.endsWith('.svg')) - Number(a.endsWith('.svg')))[0];
}

async function loadProject(repo: Repo) {
  const [readme, release, files] = await Promise.all([getReadme(repo), getLatestRelease(repo), listFiles(repo)]);
  const raw = (file: string | undefined) =>
    file && `https://raw.githubusercontent.com/${repo.full_name}/${repo.default_branch}/${file}`;
  return {
    readme,
    release,
    icon: raw(pickFile(files, ICON)),
    cover: raw(pickFile(files, COVER)),
  };
}

function visibleRepos(repos: Repo[]) {
  const self = process.env.GITHUB_REPOSITORY?.split('/')[1]?.toLowerCase();
  return repos.filter(
    (repo) =>
      !repo.private &&
      !repo.fork &&
      !repo.archived &&
      repo.name !== '.github' &&
      repo.name.toLowerCase() !== `${ORG}.github.io` &&
      repo.name.toLowerCase() !== self,
  );
}

export function projectsLoader(): Loader {
  return {
    name: 'bitoolkit-projects',
    async load({ store, parseData, renderMarkdown, logger, config }) {
      const site = config.site!;
      const [repos, { projects: listed }] = await Promise.all([listRepos(), loadProfile()]);
      const order = [...new Set([...PINNED_PROJECTS, ...listed.keys()])];
      const rank = (repo: Repo) => {
        const index = order.indexOf(repo.name.toLowerCase());
        return index === -1 ? order.length : index;
      };
      const visible = visibleRepos(repos).sort(
        (a, b) => rank(a) - rank(b) || b.pushed_at.localeCompare(a.pushed_at),
      );

      store.clear();
      await Promise.all(
        visible.map(async (repo, index) => {
          const { readme, release, icon, cover } = await loadProject(repo);
          const rendered = readme
            ? await renderMarkdown(readme.content, {
                fileURL: new URL(`https://github.com/${repo.full_name}/blob/${repo.default_branch}/${readme.path}`),
              })
            : undefined;
          const header = rendered?.metadata?.frontmatter?.readme ?? { actions: [] };
          const profileEntry = listed.get(repo.name.toLowerCase());
          const summary = profileEntry?.summary || repo.description || '';
          const logo = header.logo ?? icon;
          const id = repo.name.toLowerCase();
          const data = await parseData({
            id,
            data: {
              order: index,
              repo: repo.name,
              name: profileEntry?.name ?? header.title ?? repo.name,
              summary,
              tagline: header.tagline ?? summary,
              logo,
              cover: header.cover ?? cover,
              colors: logo ? await accentFromImage(logo) : BRAND_ACCENT,
              url: repo.html_url,
              website: externalWebsite(repo, site),
              language: repo.language ?? undefined,
              license: repo.license?.spdx_id && repo.license.spdx_id !== 'NOASSERTION' ? repo.license.spdx_id : undefined,
              pushedAt: repo.pushed_at,
              actions: header.actions,
              release: release && {
                tag: release.tag_name,
                url: release.html_url,
                publishedAt: release.published_at,
                assets: release.assets
                  .filter((asset) => !HIDDEN_ASSET.test(asset.name))
                  .map((asset) => ({ name: asset.name, size: asset.size, url: asset.browser_download_url })),
              },
            },
          });
          store.set({
            id,
            data,
            rendered: rendered && {
              html: rendered.html,
              metadata: { headings: rendered.metadata?.headings ?? [] },
            },
          });
          if (!readme) logger.warn(`${repo.full_name} has no README`);
        }),
      );
    },
  };
}
