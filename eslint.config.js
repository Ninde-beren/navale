import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', '**/*.config.*'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },
  {
    // Le moteur n'importe rien : ni Node, ni DOM, ni dépendance npm.
    // Seuls les types de @navale/protocol sont autorisés (effacés à l'exécution).
    files: ['packages/engine/src/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@navale/protocol',
              allowTypeImports: true,
              message: 'Le moteur importe seulement les types de @navale/protocol.',
            },
          ],
          patterns: [
            {
              regex: '^(?!\\.\\.?/)(?!@navale/protocol$)',
              message:
                "Le moteur n'importe aucun module externe : ni Node, ni DOM, ni dépendance npm.",
            },
          ],
        },
      ],
    },
  },
);
