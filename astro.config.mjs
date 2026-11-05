import { satteri } from '@astrojs/markdown-satteri';
import { defineConfig } from 'astro/config';
import { readmePlugin } from './src/lib/readme-plugin';

export default defineConfig({
  site: process.env.SITE_URL ?? 'https://bitoolkit.github.io',
  base: process.env.BASE_PATH || '/',
  trailingSlash: 'always',
  markdown: {
    processor: satteri({ hastPlugins: [readmePlugin], features: { rawHtml: true } }),
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark' },
      defaultColor: false,
    },
  },
});
