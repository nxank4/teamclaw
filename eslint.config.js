import tsPlugin from "@typescript-eslint/eslint-plugin";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  { ignores: ["dist/**", "src/dist/**", "node_modules/**", "src/api/**", "src/middleware/**", "src/routes/**"] },
  ...tsPlugin.configs["flat/recommended"],
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
    },
  },
  // Theme tokens: forbid the raw palette + chalk + hex literals outside
  // src/tui/themes/. Components must go through the `tokens` API so the
  // 3-layer system stays the single source of truth for color.
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    ignores: [
      "src/tui/themes/**",
      "src/web/**",
      "**/*.test.ts",
      "**/*.test.tsx",
    ],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [
          {
            name: "chalk",
            message: "Use `tokens` from src/tui/themes/tokens.js instead of chalk.",
          },
        ],
        patterns: [
          {
            group: ["**/themes/default", "**/themes/default.js"],
            importNames: ["ctp"],
            message: "Use the `tokens` API from src/tui/themes/tokens.js instead of the raw palette.",
          },
        ],
      }],
      "no-restricted-syntax": ["error", {
        selector: "Literal[value=/^#[0-9a-fA-F]{6}$/]",
        message: "Raw hex literals belong in palette files only — use a token.",
      }],
    },
  },
  {
    files: ["src/web/client/**/*.ts", "src/web/client/**/*.tsx"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
];
