/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment:
        'Circular dependencies cause unpredictable initialization order and are a strong signal of poor module design.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      severity: 'error',
      comment: 'Orphan modules are dead code — they are not imported by anything.',
      from: {
        orphan: true,
        pathNot: [
          '\\.(spec|test)\\.ts$',
          '^src/index\\.ts$',
          '^src/database/schema/',
          '^src/database/seeds/',
          '\\.gitkeep$',
        ],
      },
      to: {},
    },
    {
      name: 'no-test-in-src',
      severity: 'error',
      comment: 'Source code must not import from test files.',
      from: { path: '^src/', pathNot: '\\.(test|spec)\\.ts$' },
      to: { path: '(\\.(test|spec)\\.ts$|^test/)' },
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      comment: 'Do not allow imports of modules that cannot be resolved on the disk.',
      from: {},
      to: {
        couldNotResolve: true,
        pathNot: '^bun',
      },
    },
    {
      name: 'not-to-unlisted-dep',
      severity: 'error',
      comment: 'Do not allow imports of packages that are not in package.json.',
      from: { path: '^src/' },
      to: {
        dependencyTypes: ['unknown', 'npm-no-pkg', 'npm-unknown'],
        pathNot: '^bun',
      },
    },
    {
      name: 'strict-utils-isolation',
      severity: 'error',
      comment: 'Pure utility functions must not depend on application layers.',
      from: { path: '^src/utils/' },
      to: { path: '^src/(core|database|modules|integrations)/' },
    },
    {
      name: 'strict-config-isolation',
      severity: 'error',
      comment:
        'Configuration is the root of the graph: it may only use libraries, never application layers (prevents config <-> logger style cycles).',
      from: { path: '^src/config/' },
      to: { path: '^src/(core|database|modules|integrations|utils)/' },
    },
    {
      name: 'strict-core-isolation',
      severity: 'error',
      comment: 'Core layer must not import from domain modules, database, or integration layers.',
      from: { path: '^src/core/' },
      to: { path: '^src/(modules|database|integrations)/' },
    },
    {
      name: 'strict-schema-isolation',
      severity: 'error',
      comment: 'Database schema definitions must not depend on modules, core, or config layers.',
      from: { path: '^src/database/schema/' },
      to: { path: '^src/(modules|core|config|integrations)/' },
    },
    {
      name: 'strict-database-isolation',
      severity: 'error',
      comment: 'Database infrastructure layer must not depend on domain modules layer.',
      from: { path: '^src/database/' },
      to: { path: '^src/(modules|integrations)/' },
    },
    {
      name: 'strict-integrations-isolation',
      severity: 'error',
      comment:
        'Outbound integration adapters must not depend on domain modules or database layers.',
      from: { path: '^src/integrations/' },
      to: { path: '^src/(modules|database)/' },
    },
    {
      name: 'no-cross-integration-deps',
      severity: 'error',
      comment: 'Integration adapters must not cross-import other integration adapters directly.',
      from: { path: '^src/integrations/([^/]+)/' },
      to: { path: '^src/integrations/([^/]+)/', pathNot: '^src/integrations/$1/' },
    },
    {
      name: 'integrations-no-presentation',
      severity: 'error',
      comment:
        'Outbound integrations are internal services and must not depend on HTTP controllers or routes.',
      from: { path: '^src/integrations/' },
      to: { path: '\\.(controller|routes)\\.ts$' },
    },
    {
      name: 'http-client-only-in-integrations',
      severity: 'error',
      comment:
        'HttpClientService is strictly infrastructure for outbound adapters. Only src/integrations/ is allowed to import from src/core/http.',
      from: {
        path: '^src/',
        pathNot: '^src/(core/http|integrations)/',
      },
      to: { path: '^src/core/http/' },
    },
    {
      name: 'no-module-direct-db-connection',
      severity: 'error',
      comment:
        'Domain modules must never import database connection directly. Use TransactionHost or database abstraction functions.',
      from: { path: '^src/modules/' },
      to: { path: '^src/database/connection\\.ts$' },
    },
    {
      name: 'no-cross-module-deps',
      severity: 'error',
      comment: 'Feature modules must not cross-import other domain modules directly.',
      from: { path: '^src/modules/([^/]+)/' },
      to: { path: '^src/modules/([^/]+)/', pathNot: '^src/modules/$1/' },
    },
    {
      name: 'controller-no-repository',
      severity: 'error',
      comment:
        'Controllers must not depend on repositories directly. All database access must be orchestrated by services.',
      from: { path: '^src/modules/.+\\.controller\\.ts$' },
      to: { path: '^src/modules/.+\\.repository\\.ts$' },
    },
    {
      name: 'controller-no-integrations',
      severity: 'error',
      comment:
        'Controllers must not depend on integrations directly. All external service calls must be orchestrated by services.',
      from: { path: '^src/modules/.+\\.controller\\.ts$' },
      to: { path: '^src/integrations/' },
    },
    {
      name: 'routes-no-service-or-repo',
      severity: 'error',
      comment:
        'Routes must only bind controllers and middlewares. They must never directly call services or repositories.',
      from: { path: '^src/modules/.+\\.routes\\.ts$' },
      to: { path: '^src/modules/.+\\.(service|repository)\\.ts$' },
    },
    {
      name: 'service-no-controller-or-routes',
      severity: 'error',
      comment:
        'Services contain domain logic and must never depend on presentation artifacts (controllers or routes).',
      from: { path: '^src/modules/.+\\.service\\.ts$' },
      to: { path: '^src/modules/.+\\.(controller|routes)\\.ts$' },
    },
    {
      name: 'service-no-transformer',
      severity: 'error',
      comment:
        'Services must return domain entities/data. Presentation transformers belong in controllers.',
      from: { path: '^src/modules/.+\\.service\\.ts$' },
      to: { path: '^src/modules/.+\\.transformer\\.ts$' },
    },
    {
      name: 'repository-no-service-or-controller',
      severity: 'error',
      comment:
        'Repositories are data-access leaves and must never depend on services, controllers, or routes.',
      from: { path: '^src/modules/.+\\.repository\\.ts$' },
      to: { path: '^src/modules/.+\\.(service|controller|routes)\\.ts$' },
    },
    {
      name: 'transformer-pure',
      severity: 'error',
      comment:
        'Transformers must be pure mapping functions and never depend on stateful services, repositories, or controllers.',
      from: { path: '^src/modules/.+\\.transformer\\.ts$' },
      to: { path: '^src/modules/.+\\.(service|repository|controller|routes)\\.ts$' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: './tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
    reporterOptions: {
      dot: {
        collapsePattern: 'node_modules/[^/]+',
      },
      archi: {
        collapsePattern: '^(node_modules|src/[^/]+|test)',
      },
    },
  },
};
