import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { orgLoader, projectsLoader } from './lib/loaders';

const org = defineCollection({
  loader: orgLoader(),
  schema: z.object({
    title: z.string(),
    tagline: z.string().optional(),
    description: z.string().optional(),
    disclaimer: z.string().optional(),
    avatar: z.url(),
    url: z.url(),
    community: z.url().optional(),
  }),
});

const projects = defineCollection({
  loader: projectsLoader(),
  schema: z.object({
    order: z.number(),
    repo: z.string(),
    name: z.string(),
    summary: z.string(),
    tagline: z.string(),
    logo: z.url().optional(),
    cover: z.url().optional(),
    colors: z.object({ deep: z.string(), accent: z.string(), soft: z.string() }),
    url: z.url(),
    website: z.url().optional(),
    language: z.string().optional(),
    license: z.string().optional(),
    pushedAt: z.iso.datetime(),
    actions: z.array(z.object({ label: z.string(), href: z.string() })),
    release: z
      .object({
        tag: z.string(),
        url: z.url(),
        publishedAt: z.iso.datetime(),
        assets: z.array(z.object({ name: z.string(), size: z.number(), url: z.url() })),
      })
      .nullable(),
  }),
});

export const collections = { org, projects };
