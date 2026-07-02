/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
    es2022: true,
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    ecmaFeatures: {
      jsx: true,
    },
  },
  plugins: [
    "@typescript-eslint",
    "react",
    "react-hooks",
  ],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended",
    "prettier", // 必须放在最后，覆盖与 Prettier 冲突的规则
  ],
  settings: {
    react: {
      version: "detect",
    },
  },
  rules: {
    // ── 核心代码质量 ──
    "no-console": ["warn", { allow: ["warn", "error", "info"] }],
    "no-debugger": "error",
    "no-alert": "warn",
    "no-var": "error",
    "prefer-const": "error",
    "prefer-arrow-callback": "error",
    "prefer-template": "warn",

    // ── TypeScript 严格规则 ──
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/explicit-function-return-type": "off",
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      },
    ],
    "@typescript-eslint/consistent-type-imports": [
      "error",
      { prefer: "type-imports" },
    ],
    "@typescript-eslint/no-empty-interface": "warn",
    "@typescript-eslint/no-non-null-assertion": "warn",

    // ── React 规则 ──
    "react/react-in-jsx-scope": "off", // React 17+ JSX 不需要显式 import React
    "react/prop-types": "off", // TypeScript 已提供类型检查
    "react/jsx-no-target-blank": "error",
    "react/jsx-key": "error",
    "react/self-closing-comp": "warn",

    // ── React Hooks ──
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "warn",
  },
  overrides: [
    // ── 服务端代码（Node.js） ──
    {
      files: ["src/**/*.ts", "../packages/shared/**/*.ts"],
      rules: {
        "no-console": "off", // 服务端允许 console
      },
    },
    // ── 测试文件 ──
    {
      files: ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "**/*.spec.tsx"],
      env: {
        jest: true,
        mocha: true,
      },
      rules: {
        "@typescript-eslint/no-explicit-any": "off",
        "no-console": "off",
      },
    },
    // ── 配置文件 ──
    {
      files: ["*.config.js", "*.config.ts", "scripts/**/*.js"],
      rules: {
        "@typescript-eslint/no-var-requires": "off",
        "no-console": "off",
      },
    },
  ],
};
