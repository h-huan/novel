import { fileURLToPath } from 'node:url';
const configDirectory = fileURLToPath(new URL('.', import.meta.url));
import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      // Mock node:sqlite for vitest (Vite can't resolve Node built-ins)
      "node:sqlite": resolve(configDirectory, "src/__mocks__/node-sqlite.ts"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    root: ".",
    poolOptions: { forks: { execArgv: ['--no-warnings'] } },

    alias: {
      "@novel/shared": resolve(configDirectory, "packages/shared/src"),
    },

    exclude: [
      "node_modules/**",
      "dist/**",
      "out/**",
      ".turbo/**",
      "**/*.config.*",
      "e2e/**",
    ],

    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      reportsDirectory: "./coverage",
      include: ["server/src/**", "desktop/src/**", "packages/**/src/**"],
      exclude: [
        "**/*.test.*",
        "**/*.spec.*",
        "**/index.ts",
        "**/*.d.ts",
        "**/main.ts",
      ],
      thresholds: {
        statements: 60,
        branches: 50,
        functions: 60,
        lines: 60,
      },
    },

    setupFiles: [],
  },
});
