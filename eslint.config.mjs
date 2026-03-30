import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

export default [
  {
    files: ["packages/*/src/**/*.ts", "packages/*/src/**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      // Catch real bugs, not style opinions
      "no-unreachable": "error",
      "no-constant-condition": "error",
      "no-duplicate-case": "error",
      "no-extra-semi": "error",
      "no-irregular-whitespace": "error",
      "no-loss-of-precision": "error",
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
      }],
    },
  },
  {
    ignores: ["**/dist/**", "**/node_modules/**", "hosted/**"],
  },
];
