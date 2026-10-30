// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { SIDEBAR } from './sidebar.mjs';

/*
 * Deployment values come from the docs workflow (actions/configure-pages): DOCS_SITE is the
 * origin, DOCS_BASE the path of the Pages site (e.g. /<repo>). Locally both are unset: the portal
 * is served at http://localhost:4321/, which is also the sitemap origin of a local or CI build
 * (the sitemap integration needs one). The GitHub link appears only when built in GitHub Actions.
 */
const repository = process.env.GITHUB_REPOSITORY;
const repositoryUrl = repository
  ? `${process.env.GITHUB_SERVER_URL ?? 'https://github.com'}/${repository}`
  : undefined;

export default defineConfig({
  site: process.env.DOCS_SITE ?? 'http://localhost:4321',
  base: process.env.DOCS_BASE,
  integrations: [
    starlight({
      title: 'Bun Hono Drizzle Blueprint',
      description: 'Production-grade backend blueprint for Bun, Hono, Drizzle and PostgreSQL',
      social: repositoryUrl ? [{ icon: 'github', label: 'GitHub', href: repositoryUrl }] : [],
      sidebar: SIDEBAR,
      customCss: ['./src/styles/custom.css'],
    }),
  ],
});
