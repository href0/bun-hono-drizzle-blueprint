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
const SOURCE_SYNTAX_RULES = [
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
];

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs', 'dist/**', 'drizzle/**', 'node_modules/**', '.husky/**'],
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
      ],
      'no-restricted-imports': ['error', { patterns: MODULE_IMPORT_PATTERNS }],
    },
  },
  {
    // AST architectural enforcement for Controllers: Pure Controllers only.
    // Must come after the modules block and include its groups (see composition note at the top).
    files: ['src/modules/**/*.controller.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...SOURCE_SYNTAX_RULES,
        ...MODULE_SYNTAX_RULES,
        ...MODULE_ERROR_RULES,
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
      // Tests assert the wire contract literally ('ERR_*') and may throw plain errors as fixtures.
      'no-restricted-syntax': 'off',
    },
  },
  {
    // Module tests still must not reach the database connection or the raw HTTP client.
    files: ['src/modules/**/*.test.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...MODULE_SYNTAX_RULES],
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
);
