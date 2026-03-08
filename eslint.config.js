import tsPlugin from "@typescript-eslint/eslint-plugin";

export default [
  { ignores: ["dist/**", "src/dist/**", "node_modules/**"] },
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
];
