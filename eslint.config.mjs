// @ts-check
import eslint from '@eslint/js';
import eslintComments from '@eslint-community/eslint-plugin-eslint-comments/configs';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/*
 * `no-restricted-syntax` / `no-restricted-imports` groups.
 * In flat config, a later override REPLACES the whole rule array of an earlier one for files
 * matched by both. Never redefine these rules ad hoc in an override: compose the groups below
 * so that every file gets the union of the groups that apply to it.
 */
const MODULE_SYNTAX_RULES = [
  {
    selector:
      'ImportDeclaration[source.value=/.*database.*/] ImportSpecifier[imported.name=/^(db|sqlClient)$/]',
    message:
      'Direct import of "db" or "sqlClient" in domain modules is strictly forbidden. Repositories must query through "this.txHost.tx"; services must use repositories or domain abstractions.',
  },
  {
    selector:
      'ImportDeclaration[source.value=/.*core\\/http.*/] ImportSpecifier[imported.name="HttpClientService"]',
    message:
      'Direct import of "HttpClientService" in domain modules is strictly forbidden. Outbound HTTP integrations must live exclusively under "src/integrations/<vendor>/".',
  },
];

/** All application source (`src/**`, tests excluded). */
const ERROR_CODE_SYNTAX_RULES = [
  {
    selector: 'Literal[value=/^ERR_/]',
    message:
      'Error code literals are forbidden. Use APP_ERROR_CODES from src/core/errors/error-codes.ts (add new codes there).',
  },
  {
    // Catches codes built at runtime such as `ERR_EXT_${origin}`.
    selector: 'TemplateElement[value.raw=/^ERR_/]',
    message:
      'Error codes must not be built dynamically. Use a fixed code from APP_ERROR_CODES (add new codes there).',
  },
];

/**
 * Time is parsed, converted and read in local time only in src/utils/datetime.util.ts (D13):
 * `new Date(<value>)` and `Date.parse` guess the zone of strings without an offset, local
 * getters/formatters depend on the host's TZ, and even `new Date()` for "now" is routed through
 * the module so there is exactly one way to obtain a time value.
 */
const DATETIME_SYNTAX_RULES = [
  {
    selector: 'NewExpression[callee.name="Date"]',
    message:
      'new Date(...) is only allowed in src/utils/datetime.util.ts. Use nowInstant() / nowIsoUtc() for "now", parseInstant() / parseCalendarDate() for text, instantFromDate() / instantToDate() for libraries that speak Date.',
  },
  {
    selector: 'MemberExpression[object.name="Temporal"][property.name="Now"]',
    message:
      'Temporal.Now is only used in src/utils/datetime.util.ts. Use nowInstant() / nowIsoUtc().',
  },
  {
    selector: 'MemberExpression[object.name="Date"][property.name="parse"]',
    message: 'Date.parse guesses the zone of strings without an offset. Use parseInstant().',
  },
  {
    selector:
      'CallExpression[callee.property.name=/^(getHours|getMinutes|getSeconds|getMilliseconds|getDate|getDay|getMonth|getFullYear|getYear|getTimezoneOffset|setHours|setMinutes|setSeconds|setDate|setMonth|setFullYear|toLocaleString|toLocaleDateString|toLocaleTimeString|toDateString|toTimeString)$/]',
    message:
      'Local-time Date getters/setters/formatters depend on the host zone. Use Temporal via src/utils/datetime.util.ts (or Intl.NumberFormat for numbers).',
  },
];

/** PostgreSQL schemas and the table factory are declared once, in src/database/schema/schemas.ts (D14). */
const SCHEMA_DECLARATION_RULES = [
  {
    selector: 'CallExpression[callee.name="pgSchema"]',
    message:
      'pgSchema() is only allowed in src/database/schema/schemas.ts. Tables use appTable(); reference views use referenceSchema.',
  },
];

/**
 * Inside schema files, ids, timestamps and tables come from the column helpers
 * (src/database/schema/columns.ts) so every table follows the same conventions.
 */
const SCHEMA_FILE_RULES = [
  {
    selector: 'CallExpression[callee.name=/^(timestamp|date|serial|smallserial|bigserial)$/]',
    message:
      'Use the column helpers from ../columns: instant() / timestamps() / softDelete() for timestamps, calendarDate() for dates, uuidPrimaryKey() (or sequentialPrimaryKey() for APPEND_ONLY_TABLES) for ids.',
  },
  {
    selector: 'CallExpression[callee.name="pgTable"]',
    message: 'Declare tables with appTable(...) from ../schemas (the single table factory).',
  },
  {
    selector: 'CallExpression[callee.property.name="defaultRandom"]',
    message:
      'defaultRandom() generates UUID v4 in the database. Primary keys use uuidPrimaryKey() (UUID v7 from the app).',
  },
];

/** `sql.raw()` bypasses parameterization. Prefer `sql.identifier()`; a justified `eslint-disable` otherwise. */
const SQL_RAW_RULES = [
  {
    selector: 'CallExpression[callee.object.name="sql"][callee.property.name="raw"]',
    message:
      'sql.raw() bypasses parameterization. Use sql`...` with interpolated values or sql.identifier() for names; if a static fragment is really needed, disable this line with the reason.',
  },
];

/*
 * Outbound HTTP goes only through HttpClientService (src/core/http): mandatory
 * timeout, keep-alive pool, X-Request-ID, vendor failures masked as ExternalServiceError with the
 * vendor body only in the log. A raw fetch()/axios call silently skips all of that.
 */
const OUTBOUND_HTTP_MESSAGE =
  'Outbound HTTP must go through HttpClientService (src/core/http), called from an adapter under src/integrations/<vendor>/. It enforces the timeout, X-Request-ID and vendor error masking.';

const OUTBOUND_HTTP_SYNTAX_RULES = [
  {
    selector: 'CallExpression[callee.name="fetch"]',
    message: OUTBOUND_HTTP_MESSAGE,
  },
  {
    selector:
      'CallExpression[callee.property.name="fetch"][callee.object.name=/^(globalThis|global|self|window|Bun)$/]',
    message: OUTBOUND_HTTP_MESSAGE,
  },
];

const OUTBOUND_HTTP_IMPORT_PATTERN = {
  regex: '^(axios|node-fetch|undici|got|ky|superagent)(/.*)?$|^(node:)?(http|https|http2)$',
  message: OUTBOUND_HTTP_MESSAGE,
};

const SOURCE_SYNTAX_RULES = [
  ...ERROR_CODE_SYNTAX_RULES,
  ...DATETIME_SYNTAX_RULES,
  ...SCHEMA_DECLARATION_RULES,
  ...SQL_RAW_RULES,
  ...OUTBOUND_HTTP_SYNTAX_RULES,
];

/*
 * Data layer: every change of a domain row goes through the repository bases, which
 * lock, scope soft-deleted rows, stamp the actor and write record_changes in the same transaction.
 */
const TX_OBJECT = ':matches([callee.object.property.name="tx"], [callee.object.name="tx"])';

const RAW_WRITE_SQL_RULES = [
  {
    selector:
      'TaggedTemplateExpression[tag.name="sql"] TemplateElement[value.raw=/\\b(update|delete\\s+from)\\b/i]',
    message:
      'Raw UPDATE / DELETE bypasses the audit trail (record_changes) and soft-delete scoping. Use the repository base methods (updateById, softDeleteById, ChildRepository …).',
  },
];

/** Outside repositories: no database writes at all. */
const TX_WRITE_RULES = [
  {
    selector: `CallExpression[callee.property.name=/^(insert|update|delete)$/]${TX_OBJECT}`,
    message:
      'Database writes belong in a *.repository.ts that extends a repository base (BaseRepository, ChildRepository, DependentRepository, AppendOnlyRepository).',
  },
];

/** Raw queries (`tx.execute`) live in *.queries.ts: pure, read-only functions. */
const RAW_QUERY_RULES = [
  {
    selector: `CallExpression[callee.property.name="execute"]${TX_OBJECT}`,
    message:
      'Raw queries live in a <name>.queries.ts file (pure read-only functions); see docs/standards/raw-queries.md.',
  },
];

/** @Transactional() marks a business operation: services only. */
const TRANSACTIONAL_RULES = [
  {
    selector: 'Decorator[expression.callee.name="Transactional"]',
    message:
      "@Transactional() belongs on service methods (*.service.ts). Repositories join the caller's transaction through this.txHost.tx.",
  },
];

/** Module repositories: one base per table kind, and no UPDATE / DELETE around it. */
const REPOSITORY_SYNTAX_RULES = [
  {
    selector:
      'ClassDeclaration:not([superClass.name=/^(BaseRepository|ChildRepository|DependentRepository|AppendOnlyRepository|ReadOnlyRepository)$/])',
    message:
      'A module repository extends BaseRepository (standalone/header), ChildRepository (detail), DependentRepository (dependent), AppendOnlyRepository (record) or ReadOnlyRepository (reference view); see docs/standards/database.md §6.',
  },
  {
    selector: `CallExpression[callee.property.name=/^(update|delete)$/]${TX_OBJECT}`,
    message:
      'UPDATE / DELETE in a module repository bypasses locking and record_changes. Use the base methods (updateById, softDeleteById, restoreById, ChildRepository …).',
  },
];

/**
 * The one approved exception (docs/decisions.md §2): the refresh-token
 * repository needs no base and may revoke tokens with UPDATE — rotation is high-volume security state whose own columns
 * (`revoked_at`, `replaced_by_id`) are the trail. Only `auth_refresh_tokens` may be updated;
 * DELETE stays banned.
 */
const AUTH_TOKEN_REPOSITORY_RULES = [
  {
    selector: `CallExpression[callee.property.name="update"]${TX_OBJECT}:not([arguments.0.name="authRefreshTokens"])`,
    message:
      'The auth repository may only update authRefreshTokens (approved exception, docs/decisions.md §2); other tables go through their own repository base.',
  },
  {
    selector: `CallExpression[callee.property.name="delete"]${TX_OBJECT}`,
    message:
      'DELETE is not part of the refresh-token exception (docs/decisions.md §2); revoke tokens instead.',
  },
];

/**
 * The write rules above recognize the transaction by name (`this.txHost.tx`, `tx`). Keeping it in a
 * variable under another name (`const db = this.txHost.tx`, `const { tx: db } = this.txHost`) would
 * hide writes from them, so modules use `this.txHost.tx` directly.
 */
const TX_ALIAS_RULES = [
  {
    selector: 'VariableDeclarator[init.type="MemberExpression"][init.property.name="tx"]',
    message:
      'Use this.txHost.tx directly instead of keeping the transaction in a variable (keeps every write visible to the data-layer rules).',
  },
  {
    selector: 'VariableDeclarator > ObjectPattern > Property[key.name="tx"]',
    message:
      'Use this.txHost.tx directly instead of destructuring the transaction (keeps every write visible to the data-layer rules).',
  },
  {
    selector: 'AssignmentExpression[right.type="MemberExpression"][right.property.name="tx"]',
    message:
      'Use this.txHost.tx directly instead of assigning the transaction to a variable (keeps every write visible to the data-layer rules).',
  },
];

const MODULE_DATA_RULES = [...RAW_WRITE_SQL_RULES, ...TX_ALIAS_RULES];

/** Domain modules only: business failures must be typed ApiErrors. */
const MODULE_ERROR_RULES = [
  {
    selector: 'ThrowStatement > :matches(NewExpression, CallExpression)[callee.name="Error"]',
    message:
      'Throwing a plain Error in a module is forbidden. Throw a semantic ApiError (e.g. NotFoundError, ConflictError; InternalServerError for broken invariants).',
  },
  {
    // User-facing messages must be localized. InternalServerError is exempt: its text is log-only.
    // ExternalServiceError is checked separately: its first argument is the failure kind, not text.
    selector:
      'NewExpression[callee.name=/^(ApiResponse|(?!(InternalServerError|ExternalServiceError)$)[A-Za-z]+Error)$/] > :matches(Literal[raw=/^[\'"]/], TemplateLiteral)',
    message:
      "User-facing messages must be a LocalizedMessage ({ id, en }) from I18N_MESSAGES or the module's <name>.messages.ts, not a string literal.",
  },
  {
    selector:
      'NewExpression[callee.name="ExternalServiceError"] > :matches(Literal[raw=/^[\'"]/], TemplateLiteral):nth-child(2)',
    message:
      "User-facing messages must be a LocalizedMessage ({ id, en }) from I18N_MESSAGES or the module's <name>.messages.ts, not a string literal.",
  },
  {
    selector:
      'NewExpression[callee.name=/^(?!InternalServerError$)[A-Za-z]+Error$/] Property[key.name="message"] > :matches(Literal[raw=/^[\'"]/], TemplateLiteral)',
    message:
      "Error detail messages must be a LocalizedMessage ({ id, en }) from the module's <name>.messages.ts, not a string literal.",
  },
];

const CONTROLLER_SYNTAX_RULES = [
  {
    selector: 'MemberExpression[object.name="c"][property.name=/^(json|text|body|html)$/]',
    message:
      'Sending a response directly from a controller is forbidden. Return an instance of ApiResponse wrapped with asyncHandler.',
  },
  {
    // Request headers (c.req.header) are not validated by validate() and stay readable.
    selector:
      'MemberExpression[object.object.name="c"][object.property.name="req"][property.name=/^(json|parseBody|formData|text|arrayBuffer|blob|query|queries|param|valid)$/]',
    message:
      'Controllers read input only through validate() + getValidatedBody(c) / getValidatedQuery(c) / getValidatedParams(c), never from c.req directly.',
  },
  {
    // Every handler is `name = asyncHandler(async (c) => …)`; methods and plain arrow fields skip it.
    selector:
      'ClassBody > PropertyDefinition[value]:not([value.callee.name="asyncHandler"]), ClassBody > MethodDefinition[kind!="constructor"]',
    message:
      'Controller handlers are class fields wrapped in asyncHandler: `name = asyncHandler(async (c) => …)`. Move helpers out of the class.',
  },
];

/** Redis is reached only through CacheService (serialization, fail-open, readiness check). */
const CACHE_CLIENT_IMPORT_PATTERN = {
  group: ['**/core/cache/redis.client*', 'ioredis'],
  message:
    'Use CacheService / cacheService from core/cache instead of the Redis client: it owns serialization, the readiness check and fail-open error handling.',
};

/**
 * Bun's mock.module() replaces a module for every later test file in the process — it leaked a fake
 * Redis client and a fake database connection (review of phase 1) into unrelated tests.
 * Inject dependencies instead (constructor defaults, function parameters).
 */
const TEST_SYNTAX_RULES = [
  {
    selector: 'CallExpression[callee.object.name="mock"][callee.property.name="module"]',
    message:
      'mock.module() leaks into every later test file. Inject the dependency instead (constructor default or parameter).',
  },
];

/*
 * Integration suite (test/integration/**, `bun run test:int`): real PostgreSQL and
 * Redis, through the real code path. In Bun 1.3.0 `expect(promise).rejects` / `.resolves` wait on
 * the promise in a way that can stall real socket I/O (a transaction stuck "idle in transaction");
 * spies and mocks would replace exactly what the suite exists to exercise.
 */
const INTEGRATION_TEST_RULES = [
  {
    selector: 'MemberExpression[property.name=/^(rejects|resolves)$/]',
    message:
      'expect(promise).rejects/.resolves can stall real I/O in Bun 1.3.0. Await first: rejectionOf(promise) from test/helpers/integration.ts, then assert.',
  },
  {
    selector: 'CallExpression[callee.name=/^(spyOn|mock)$/]',
    message:
      'Integration tests run the real code path against real services: no spyOn() / mock(). Use a unit or e2e test for fakes.',
  },
];

const MODULE_IMPORT_PATTERNS = [
  {
    group: ['**/database/connection*'],
    message:
      'Domain modules must never import from database/connection directly. Connection management is internal to the database infrastructure layer.',
  },
  {
    group: ['**/core/http*'],
    message:
      'Domain modules must never import from core/http directly. Outbound HTTP integrations must live exclusively under "src/integrations/<vendor>/".',
  },
  CACHE_CLIENT_IMPORT_PATTERN,
  OUTBOUND_HTTP_IMPORT_PATTERN,
  {
    group: ['**/database', '**/database/**'],
    importNames: ['recordChanges'],
    message:
      'record_changes is written only by the repository bases (AuditedRepository); modules never touch it directly.',
  },
];

/** Outside repositories and *.queries.ts: no transaction host (data access goes through repositories). */
const TX_HOST_IMPORT_PATTERN = {
  group: ['**/database', '**/database/**'],
  importNames: ['TransactionHost', 'defaultTxHost', 'transactionStorage'],
  message:
    'TransactionHost is for repositories and *.queries.ts only. Services call repositories; use @Transactional() / runInTransaction() for transactions.',
};

/**
 * CLI questions only through scripts/lib/prompter.ts (D40): one look and one cancel for every
 * script, and the tests answer them with a scripted Prompter.
 */
const CLI_PROMPT_IMPORT_PATTERNS = [
  {
    group: ['@clack/*'],
    message:
      'Ask through the Prompter of scripts/lib/prompter.ts (terminalPrompter; scriptedPrompter in tests), never @clack directly.',
  },
  {
    group: ['readline', 'readline/*', 'node:readline', 'node:readline/*'],
    message:
      'Questions go through the Prompter of scripts/lib/prompter.ts; piped input through readPipedLine (scripts/lib/read-secret.ts).',
  },
];

/*
 * Inbound channels (D23–D27). A module file name says which caller it serves —
 * `<module>[.<channel>].<role>.ts`, a channel of CHANNEL_CALLERS (no channel = users with access
 * tokens) — and only that caller's helpers may appear in it. A dedicated rule (not
 * `no-restricted-syntax`) so it never collides with the role-based groups above.
 */
/** @type {Record<string, string[]>} Helpers per caller. */
const CHANNEL_HELPERS = {
  user: ['requireRole', 'requireSelfOrRole', 'currentUser'],
  // partner:start
  partner: ['currentPartner', 'requirePartner'],
  // partner:end
  webhook: ['currentWebhook'],
};
/** @typedef {keyof typeof CHANNEL_HELPERS} Caller */

/** @type {Record<string, Caller[]>} Callers per channel (`default` = no channel in the name). */
const CHANNEL_CALLERS = {
  default: ['user'],
  // partner:start
  partner: ['partner'],
  // partner:end
  webhook: ['webhook'],
};
/** @typedef {keyof typeof CHANNEL_CALLERS} Channel */

/**
 * @param {string} filename
 * @returns {Channel}
 */
const channelOf = (filename) => {
  const base = filename.split(/[\\/]/).pop() ?? '';
  const channel = Object.keys(CHANNEL_CALLERS).find((name) => base.includes(`.${name}.`));
  return channel ?? 'default';
};

/** @type {import('eslint').Rule.RuleModule} */
const inboundChannelRule = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      forbidden:
        '"{{name}}" is a {{kind}}-channel helper, but this file serves the {{channel}} channel. Name the files of a channel <module>.<channel>.<role>.ts (webhook: <module>.webhook.<role>.ts); keep each channel in its own files (D24).',
      verbatimBody:
        "bodyKeys: 'verbatim' (vendor-owned payload casing) is only for vendor webhooks, in <module>.webhook.<role>.ts files; our own contracts are snake_case (D10, D23).",
    },
  },
  create(context) {
    const channel = channelOf(context.filename);
    /** @type {Map<string, string>} */
    const banned = new Map();
    for (const [kind, names] of /** @type {[Caller, string[]][]} */ (
      Object.entries(CHANNEL_HELPERS)
    )) {
      if (CHANNEL_CALLERS[channel].includes(kind)) continue;
      for (const name of names) banned.set(name, kind);
    }
    return {
      Property(node) {
        if (channel === 'webhook') return;
        const key = /** @type {any} */ (node).key;
        const value = /** @type {any} */ (node).value;
        if (key?.name === 'bodyKeys' && value?.type === 'Literal' && value.value === 'verbatim') {
          context.report({ node, messageId: 'verbatimBody' });
        }
      },
      Identifier(node) {
        const kind = banned.get(node.name);
        if (kind === undefined) return;
        const parent = /** @type {any} */ (node).parent;
        // Object keys and class members that merely share the name are not the helper.
        if (
          ['Property', 'PropertyDefinition', 'MethodDefinition'].includes(parent.type) &&
          parent.key === node &&
          !parent.computed
        ) {
          return;
        }
        // `import { currentUser as x }`: report once, on the imported name.
        if (
          parent.type === 'ImportSpecifier' &&
          parent.local === node &&
          parent.imported !== node
        ) {
          return;
        }
        context.report({ node, messageId: 'forbidden', data: { name: node.name, kind, channel } });
      },
    };
  },
};

export default tseslint.config(
  {
    // docs-site/ is a separate Astro project with its own dependencies (not type-checked here).
    ignores: [
      'eslint.config.mjs',
      'dist/**',
      'drizzle/**',
      'node_modules/**',
      '.husky/**',
      'docs-site/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  eslintPluginPrettierRecommended,
  eslintComments.recommended,
  {
    // Rules can only be silenced deliberately: scoped, justified (`-- <reason>`), and still needed.
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      '@eslint-community/eslint-comments/require-description': 'error',
      '@eslint-community/eslint-comments/no-unlimited-disable': 'error',
      '@eslint-community/eslint-comments/no-unused-disable': 'error',
      '@eslint-community/eslint-comments/disable-enable-pair': ['error', { allowWholeFile: true }],
    },
  },
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.builtin,
      },
      sourceType: 'module',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      // TypeScript strictness: enforce explicit typing across modules
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-useless-constructor': 'off',
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        {
          allowNumber: true,
          allowBoolean: true,
        },
      ],

      // General hygiene
      'no-console': 'error',
      'no-process-env': 'error',

      // Strict Naming Conventions
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'default',
          format: ['camelCase'],
          leadingUnderscore: 'allow',
          trailingUnderscore: 'forbid',
        },
        {
          selector: 'variable',
          format: ['camelCase', 'UPPER_CASE'],
          leadingUnderscore: 'allow',
        },
        {
          selector: 'function',
          format: ['camelCase', 'PascalCase'], // Allow PascalCase for Decorators / Custom Middlewares
        },
        {
          selector: 'parameter',
          format: ['camelCase'],
          leadingUnderscore: 'allow',
        },
        {
          selector: 'property',
          format: ['camelCase', 'UPPER_CASE'],
          leadingUnderscore: 'allow',
        },
        {
          // Allow quoted properties like HTTP headers ('Content-Type', 'Connection')
          selector: 'property',
          modifiers: ['requiresQuotes'],
          format: null,
        },
        {
          selector: 'import',
          format: ['camelCase', 'PascalCase', 'UPPER_CASE'],
        },
        {
          selector: 'class',
          format: ['PascalCase'],
        },
        {
          selector: 'interface',
          format: ['PascalCase'],
        },
        {
          selector: 'typeAlias',
          format: ['PascalCase'],
        },
        {
          selector: 'enum',
          format: ['PascalCase'],
        },
        {
          selector: 'enumMember',
          format: ['UPPER_CASE'],
        },
        {
          selector: 'typeParameter',
          format: ['PascalCase'],
        },
      ],
    },
  },
  {
    // Error contract: codes only from the registry (which is the one file allowed to declare them).
    files: ['src/**/*.ts'],
    ignores: ['src/core/errors/error-codes.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...SOURCE_SYNTAX_RULES],
    },
  },
  {
    // Outbound HTTP clients only in core/http (the module blocks below compose the same pattern).
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [OUTBOUND_HTTP_IMPORT_PATTERN] }],
    },
  },
  {
    // Passwords are hashed and verified only through src/core/security/password.ts (R75), so
    // stored hashes, the login dummy hash and the test cost always agree.
    files: ['src/**/*.ts', 'test/**/*.ts', 'scripts/**/*.ts'],
    ignores: ['src/core/security/password.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Bun',
          property: 'password',
          message: 'Use hashPassword / verifyPassword from src/core/security/password.ts.',
        },
      ],
    },
  },
  {
    // The one place allowed to call fetch()/axios and import node:http(s).
    files: ['src/core/http/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...ERROR_CODE_SYNTAX_RULES,
        ...DATETIME_SYNTAX_RULES,
        ...SCHEMA_DECLARATION_RULES,
        ...SQL_RAW_RULES,
      ],
      'no-restricted-imports': 'off',
    },
  },
  {
    // The one module allowed to convert between text, Date and Temporal values.
    files: ['src/utils/datetime.util.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...ERROR_CODE_SYNTAX_RULES,
        ...SCHEMA_DECLARATION_RULES,
        ...SQL_RAW_RULES,
        ...OUTBOUND_HTTP_SYNTAX_RULES,
      ],
    },
  },
  {
    // The one file allowed to declare PostgreSQL schemas.
    files: ['src/database/schema/schemas.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...ERROR_CODE_SYNTAX_RULES,
        ...DATETIME_SYNTAX_RULES,
        ...SQL_RAW_RULES,
        ...OUTBOUND_HTTP_SYNTAX_RULES,
      ],
    },
  },
  {
    // Schema files use the column helpers (columns.ts and schemas.ts define them).
    files: ['src/database/schema/**/*.ts'],
    ignores: [
      'src/database/schema/columns.ts',
      'src/database/schema/schemas.ts',
      'src/database/schema/**/*.test.ts',
    ],
    rules: {
      'no-restricted-syntax': ['error', ...SOURCE_SYNTAX_RULES, ...SCHEMA_FILE_RULES],
    },
  },
  {
    // AST architectural enforcement: Modules must never touch database connection or raw HTTP client directly
    // Defense-in-depth guards:
    // 1. AST specifier guard: catches `db`, `sqlClient`, or `HttpClientService` imports
    // 2. Path guard: catches any import from database/connection or core/http
    files: ['src/modules/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...SOURCE_SYNTAX_RULES,
        ...MODULE_SYNTAX_RULES,
        ...MODULE_ERROR_RULES,
        ...MODULE_DATA_RULES,
        ...TX_WRITE_RULES,
        ...RAW_QUERY_RULES,
        ...TRANSACTIONAL_RULES,
      ],
      'no-restricted-imports': [
        'error',
        { patterns: [...MODULE_IMPORT_PATTERNS, TX_HOST_IMPORT_PATTERN] },
      ],
    },
  },
  {
    // Services: @Transactional() allowed. (Each block below composes every group it needs.)
    files: ['src/modules/**/*.service.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...SOURCE_SYNTAX_RULES,
        ...MODULE_SYNTAX_RULES,
        ...MODULE_ERROR_RULES,
        ...MODULE_DATA_RULES,
        ...TX_WRITE_RULES,
        ...RAW_QUERY_RULES,
      ],
    },
  },
  {
    // Repositories: TransactionHost allowed; extend a base; inserts only (via the bases).
    files: ['src/modules/**/*.repository.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...SOURCE_SYNTAX_RULES,
        ...MODULE_SYNTAX_RULES,
        ...MODULE_ERROR_RULES,
        ...MODULE_DATA_RULES,
        ...REPOSITORY_SYNTAX_RULES,
        ...RAW_QUERY_RULES,
        ...TRANSACTIONAL_RULES,
      ],
      'no-restricted-imports': ['error', { patterns: MODULE_IMPORT_PATTERNS }],
    },
  },
  {
    // Refresh-token repository: approved exception to the base/no-UPDATE rules (AUTH_TOKEN_REPOSITORY_RULES).
    files: ['src/modules/auth/auth.repository.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...SOURCE_SYNTAX_RULES,
        ...MODULE_SYNTAX_RULES,
        ...MODULE_ERROR_RULES,
        ...MODULE_DATA_RULES,
        ...AUTH_TOKEN_REPOSITORY_RULES,
        ...RAW_QUERY_RULES,
        ...TRANSACTIONAL_RULES,
      ],
    },
  },
  {
    // Raw read queries: TransactionHost and tx.execute allowed, no writes.
    files: ['src/modules/**/*.queries.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...SOURCE_SYNTAX_RULES,
        ...MODULE_SYNTAX_RULES,
        ...MODULE_ERROR_RULES,
        ...MODULE_DATA_RULES,
        ...TX_WRITE_RULES,
        ...TRANSACTIONAL_RULES,
      ],
      'no-restricted-imports': ['error', { patterns: MODULE_IMPORT_PATTERNS }],
    },
  },
  {
    // Inbound channels: a file uses only the helpers of the caller its name declares (D24).
    files: ['src/modules/**/*.ts'],
    plugins: { local: { rules: { 'inbound-channel': inboundChannelRule } } },
    rules: { 'local/inbound-channel': 'error' },
  },
  {
    // AST architectural enforcement for Controllers: Pure Controllers only.
    files: ['src/modules/**/*.controller.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...SOURCE_SYNTAX_RULES,
        ...MODULE_SYNTAX_RULES,
        ...MODULE_ERROR_RULES,
        ...MODULE_DATA_RULES,
        ...TX_WRITE_RULES,
        ...RAW_QUERY_RULES,
        ...TRANSACTIONAL_RULES,
        ...CONTROLLER_SYNTAX_RULES,
      ],
    },
  },
  {
    // AST architectural enforcement: Outbound integrations must never depend on domain modules or database layer
    files: ['src/integrations/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/modules/**', '**/modules'],
              message:
                'Outbound integrations must never import from domain modules. Integrations are decoupled outbound adapters.',
            },
            {
              group: ['**/database/**', '**/database'],
              message:
                'Outbound integrations must never import from the database layer. Database persistence is reserved for domain repositories.',
            },
            CACHE_CLIENT_IMPORT_PATTERN,
            OUTBOUND_HTTP_IMPORT_PATTERN,
          ],
        },
      ],
    },
  },
  {
    // The only readers of process.env: the app's env source and drizzle-kit's standalone config.
    files: ['src/config/env-source.ts', 'drizzle.config.ts'],
    rules: {
      'no-process-env': 'off',
    },
  },
  {
    // Config schemas declare env var names as UPPER_CASE properties.
    files: ['src/config/**/*.ts', 'drizzle.config.ts'],
    rules: {
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'property',
          format: ['camelCase', 'UPPER_CASE'],
        },
      ],
    },
  },
  {
    // Override for database connection: allow third-party postgres driver snake_case options
    files: ['src/database/connection.ts', 'src/database/schema/**/*.ts'],
    rules: {
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'property',
          format: ['camelCase', 'UPPER_CASE', 'snake_case'],
        },
      ],
    },
  },
  {
    // Override for HTTP response envelopes: allow standardized snake_case response payload keys
    files: [
      'src/core/response/**/*.ts',
      'src/core/middlewares/error-handler.ts',
      'src/core/middlewares/not-found.ts',
    ],
    rules: {
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'property',
          format: ['camelCase', 'UPPER_CASE', 'snake_case'],
        },
      ],
    },
  },
  {
    // The acceptance runner sends requests to the API: snake_case wire keys, HTTP header names.
    files: ['scripts/lib/acceptance.ts'],
    rules: {
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'property',
          format: ['camelCase', 'UPPER_CASE', 'snake_case'],
        },
        { selector: 'property', modifiers: ['requiresQuotes'], format: null },
      ],
    },
  },
  {
    // Column helpers return Drizzle builder chains (e.g. PgUUIDBuilderInitial<'id'> narrowed by
    // .primaryKey().$defaultFn()); spelling them out would copy Drizzle internals and break on
    // upgrades. The inferred types are what tables need.
    files: ['src/database/schema/columns.ts'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
    },
  },
  {
    // Override for generic validation helper getters
    files: ['src/core/middlewares/validate.ts'],
    rules: {
      '@typescript-eslint/no-unnecessary-type-parameters': 'off',
    },
  },
  {
    // Override for test files: relax strict checks for mocks and test assertions
    files: ['**/*.spec.ts', '**/*.test.ts', 'test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/naming-convention': 'off',
      '@typescript-eslint/require-await': 'off',
      'no-process-env': 'off',
      'no-console': 'off',
      // Tests assert the wire contract literally ('ERR_*') and may throw plain errors as fixtures;
      // only the test-specific rules apply.
      'no-restricted-syntax': ['error', ...TEST_SYNTAX_RULES],
    },
  },
  {
    // Integration suite: real services through the real code path (INTEGRATION_TEST_RULES).
    files: ['test/integration/**/*.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...TEST_SYNTAX_RULES, ...INTEGRATION_TEST_RULES],
    },
  },
  {
    // Module tests still must not reach the database connection or the raw HTTP client; they may
    // use the transaction host to simulate a transaction.
    files: ['src/modules/**/*.test.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...MODULE_SYNTAX_RULES, ...TEST_SYNTAX_RULES],
      'no-restricted-imports': ['error', { patterns: MODULE_IMPORT_PATTERNS }],
    },
  },
  {
    // Override for standalone tooling scripts: allow console output and process.env access
    files: ['scripts/**/*.ts'],
    rules: {
      'no-console': 'off',
      'no-process-env': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
    },
  },
  {
    // One Prompter for every CLI question (R83); its own test drives the real prompts on streams.
    files: ['scripts/**/*.ts'],
    ignores: ['scripts/lib/prompter.ts', 'scripts/lib/prompter.test.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: CLI_PROMPT_IMPORT_PATTERNS }],
    },
  },
);
