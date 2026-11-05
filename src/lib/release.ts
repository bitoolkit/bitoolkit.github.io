export type Platform = 'Windows' | 'macOS' | 'Linux' | 'Android' | 'iOS' | '其他';

export const PLATFORM_ORDER: Platform[] = ['Windows', 'macOS', 'Linux', 'Android', 'iOS', '其他'];

const PLATFORM_RULES: [Platform, RegExp][] = [
  ['Android', /android|\.apk$|\.aab$/i],
  ['iOS', /[-_.]ios[-_.]|\.ipa$/i],
  ['Windows', /windows|win(32|64)|\.exe$|\.msi$/i],
  ['macOS', /macos|darwin|\.dmg$|\.app\.|\.pkg$/i],
  ['Linux', /linux|\.appimage$|\.deb$|\.rpm$/i],
];

const KIND_RULES: [string, RegExp][] = [
  ['安装程序', /setup.*\.exe$|\.msi$/i],
  ['便携版', /portable.*\.exe$/i],
  ['可执行文件', /\.exe$/i],
  ['磁盘映像', /\.dmg$/i],
  ['AppImage', /\.appimage$/i],
  ['deb 包', /\.deb$/i],
  ['rpm 包', /\.rpm$/i],
  ['APK 安装包', /\.apk$/i],
  ['AAB 包', /\.aab$/i],
  ['IPA 包', /\.ipa$/i],
  ['校验文件', /sha\d*sums?|checksums?/i],
  ['数据文件', /\.json$/i],
  ['压缩包', /\.(zip|tar\.gz|tgz|tar\.xz|tar\.zst)$/i],
];

const PREFERRED: Partial<Record<Platform, RegExp[]>> = {
  Windows: [/setup.*\.exe$/i, /\.msi$/i, /\.exe$/i, /\.zip$/i],
  macOS: [/\.dmg$/i, /\.(zip|tar\.gz)$/i],
  Linux: [/\.appimage$/i, /\.tar\.(gz|xz)$/i, /\.deb$/i],
  Android: [/\.apk$/i],
};

export interface Asset {
  name: string;
  size: number;
  url: string;
}

export interface ClassifiedAsset extends Asset {
  platform: Platform;
  kind: string;
  arch?: string;
  unsigned: boolean;
  primary: boolean;
}

function arch(name: string) {
  if (/arm64|aarch64/i.test(name)) return 'ARM64';
  if (/x64|amd64|x86_64/i.test(name)) return 'x64';
  if (/universal/i.test(name)) return '通用';
  return undefined;
}

function preference(asset: ClassifiedAsset) {
  const rules = PREFERRED[asset.platform] ?? [];
  const index = rules.findIndex((rule) => rule.test(asset.name));
  return (index === -1 ? rules.length : index) * 2 + (asset.arch === 'ARM64' ? 1 : 0);
}

export function classifyAssets(assets: Asset[]): ClassifiedAsset[] {
  const classified = assets.map((asset) => ({
    ...asset,
    platform: PLATFORM_RULES.find(([, rule]) => rule.test(asset.name))?.[0] ?? '其他',
    kind: KIND_RULES.find(([, rule]) => rule.test(asset.name))?.[0] ?? '文件',
    arch: arch(asset.name),
    unsigned: /unsigned/i.test(asset.name),
    primary: false,
  }));
  for (const platform of PLATFORM_ORDER) {
    if (!PREFERRED[platform]) continue;
    const best = classified
      .filter((asset) => asset.platform === platform)
      .sort((a, b) => preference(a) - preference(b))[0];
    if (best && preference(best) < (PREFERRED[platform]!.length) * 2) best.primary = true;
  }
  if (!classified.some((asset) => asset.primary)) {
    const universal = classified.find((asset) => asset.kind === '压缩包' || asset.kind === '文件');
    if (universal) universal.primary = true;
  }
  return classified.sort(
    (a, b) =>
      PLATFORM_ORDER.indexOf(a.platform) - PLATFORM_ORDER.indexOf(b.platform) ||
      Number(b.primary) - Number(a.primary) ||
      preference(a) - preference(b),
  );
}

export function displayVersion(tag: string) {
  return tag.replace(/^.*?(?=v?\d)/, '');
}
