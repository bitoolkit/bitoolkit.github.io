import type { Element, ElementContent, RootContent } from 'hast';
import type { HastPluginDefinition } from 'satteri';

export interface Link {
  label: string;
  href: string;
}

export interface ReadmeHeader {
  title?: string;
  tagline?: string;
  logo?: string;
  cover?: string;
  actions: Link[];
}

const BADGE = /shields\.io|badgen\.net|badge\.svg/i;
const OTHER_README = /(^|\/)README[^/]*\.md$/i;
const SEPARATORS = /^[\s|·•/\u00a0]*$/u;
const UNSAFE = ['script', 'style', 'iframe', 'object', 'embed', 'form'];
const SCRIPT_URL = /^\s*(javascript|vbscript|data):/i;
const LOGO_MAX_WIDTH = 256;

interface Bases {
  blob: URL;
  raw: URL;
  blobRoot: URL;
  rawRoot: URL;
}

function bases(fileURL: URL): Bases {
  const raw = new URL(fileURL.pathname.replace(/^(\/[^/]+\/[^/]+)\/blob\//, '$1/'), 'https://raw.githubusercontent.com');
  const root = (url: URL, segments: number) => new URL(`${url.pathname.split('/').slice(0, segments).join('/')}/`, url);
  return { blob: fileURL, raw, blobRoot: root(fileURL, 5), rawRoot: root(raw, 4) };
}

function resolve(value: string, base: URL, root: URL) {
  if (value.startsWith('#') || URL.canParse(value)) return value;
  return value.startsWith('/') ? new URL(value.slice(1), root).href : new URL(value, base).href;
}

function isElement(node: RootContent | ElementContent): node is Element {
  return node.type === 'element';
}

function findAll(node: { children: readonly (RootContent | ElementContent)[] }, tagName: string): Element[] {
  return node.children.filter(isElement).flatMap((child) => [
    ...(child.tagName === tagName ? [child] : []),
    ...findAll(child, tagName),
  ]);
}

function text(node: ElementContent): string {
  if (node.type === 'text') return node.value;
  return isElement(node) ? node.children.map(text).join('') : '';
}

function looseText(node: ElementContent): string {
  if (node.type === 'text') return node.value;
  if (!isElement(node) || node.tagName === 'a' || node.tagName === 'img') return '';
  return node.children.map(looseText).join('');
}

function readHeader(nodes: readonly RootContent[], urls: Bases) {
  const header: ReadmeHeader = { actions: [] };
  const consumed: Element[] = [];

  for (const node of nodes) {
    if (!isElement(node)) continue;
    if (node.tagName === 'h2') break;

    if (node.tagName === 'h1' && header.title === undefined) {
      header.title = text(node).trim();
      consumed.push(node);
      continue;
    }
    if (node.tagName !== 'p') continue;

    const links = findAll(node, 'a');
    const images = findAll(node, 'img');
    const bare = SEPARATORS.test(looseText(node));

    if (links.some((link) => OTHER_README.test(String(link.properties.href)))) {
      consumed.push(node);
    } else if (bare && images.length > 0 && images.every((image) => BADGE.test(String(image.properties.src)))) {
      consumed.push(node);
    } else if (bare && images.length === 1 && links.length === 0 && !header.logo) {
      const width = Number(images[0].properties.width);
      if (width > 0 && width <= LOGO_MAX_WIDTH) {
        header.logo = resolve(String(images[0].properties.src), urls.raw, urls.rawRoot);
        consumed.push(node);
      }
    } else if (bare && links.length > 0 && images.length === 0) {
      header.actions = links.map((link) => ({
        label: text(link).trim(),
        href: resolve(String(link.properties.href), urls.blob, urls.blobRoot),
      }));
      consumed.push(node);
    } else if (node.properties.align === 'center' && links.length === 0 && images.length === 0) {
      header.tagline ??= text(node).trim();
      consumed.push(node);
    }
  }
  return { header, consumed };
}

function findCover(nodes: readonly RootContent[], urls: Bases) {
  const cover = findAll({ children: nodes }, 'img').find((image) => {
    const width = Number(image.properties.width);
    return !BADGE.test(String(image.properties.src ?? '')) && !(width > 0 && width <= LOGO_MAX_WIDTH);
  });
  return cover && resolve(String(cover.properties.src), urls.raw, urls.rawRoot);
}

export const readmePlugin: HastPluginDefinition = {
  name: 'github-readme',
  before(root, ctx) {
    if (ctx.fileURL?.hostname !== 'github.com') return;
    const urls = bases(ctx.fileURL);
    const { header, consumed } = readHeader(root.children, urls);
    header.cover = findCover(root.children, urls);
    for (const node of consumed) ctx.removeNode(node);
    (ctx.data.astro as { frontmatter: Record<string, unknown> }).frontmatter.readme = header;
  },
  element: [
    {
      filter: UNSAFE,
      visit(node, ctx) {
        ctx.removeNode(node);
      },
    },
    {
      filter: [],
      visit(node, ctx) {
        for (const key of Object.keys(node.properties)) {
          if (/^on/i.test(key)) ctx.setProperty(node, key, null);
        }
        for (const key of ['href', 'src']) {
          if (SCRIPT_URL.test(String(node.properties[key] ?? ''))) ctx.setProperty(node, key, null);
        }
        if (ctx.fileURL?.hostname !== 'github.com') return;
        const urls = bases(ctx.fileURL);
        const { href, src } = node.properties;
        if (node.tagName === 'a' && typeof href === 'string') {
          ctx.setProperty(node, 'href', resolve(href, urls.blob, urls.blobRoot));
        }
        if (node.tagName === 'img' && typeof src === 'string') {
          ctx.setProperty(node, 'src', resolve(src, urls.raw, urls.rawRoot));
          ctx.setProperty(node, 'loading', 'lazy');
          ctx.setProperty(node, 'decoding', 'async');
        }
      },
    },
  ],
};
