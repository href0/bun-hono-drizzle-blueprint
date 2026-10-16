// @ts-check
/**
 * Sidebar of the documentation portal. `sync-docs.ts` fails when a synced page is missing here or
 * a slug here has no source document, so a new standard can never be hidden from the menu.
 */
export const SIDEBAR = [
  {
    label: 'Overview',
    items: [
      { label: 'Architecture & Rule Index', slug: 'overview/architecture' },
      { label: 'Quick Start', slug: 'overview/quickstart' },
    ],
  },
  {
    label: 'Getting Started',
    items: [
      { label: 'Project Structure', slug: 'standards/structure' },
      { label: 'Configuration & Environment', slug: 'standards/configuration' },
      { label: 'Bootstrap Pipeline', slug: 'standards/bootstrap' },
    ],
  },
  {
    label: 'HTTP & API Contracts',
    items: [
      { label: 'HTTP Contract & Envelopes', slug: 'standards/http-contract' },
      { label: 'Naming Conventions', slug: 'standards/naming' },
      { label: 'OpenAPI & Scalar', slug: 'standards/openapi' },
    ],
  },
  {
    label: 'Inbound Channels & Security',
    items: [
      { label: 'Auth & Inbound Channels', slug: 'standards/auth-and-inbound' },
      { label: 'Auth Guide (Frontend)', slug: 'guides/auth-guide' },
      { label: 'Partner Integration Guide', slug: 'guides/partner-integration-guide' },
    ],
  },
  {
    label: 'Data Layer',
    items: [
      { label: 'Database & Repositories', slug: 'standards/database' },
      { label: 'Transactions', slug: 'standards/transactions' },
      { label: 'Raw Queries', slug: 'standards/raw-queries' },
      { label: 'Date & Time', slug: 'standards/datetime' },
    ],
  },
  {
    label: 'Infrastructure & Outbound',
    items: [
      { label: 'Cache', slug: 'standards/cache' },
      { label: 'Outbound Integrations', slug: 'standards/integrations' },
      { label: 'Logging', slug: 'standards/logging' },
    ],
  },
  {
    label: 'Quality Gates & Workflow',
    items: [
      { label: 'New Modules (Scaffold)', slug: 'standards/new-module' },
      { label: 'Quality Gates & Commands', slug: 'standards/quality-gates' },
      { label: 'Testing', slug: 'standards/testing' },
      { label: 'Git Workflow & Commits', slug: 'standards/git-workflow' },
      { label: 'Documentation', slug: 'standards/documentation' },
    ],
  },
];
