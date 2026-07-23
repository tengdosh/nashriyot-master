import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Unit tests run in Node by default (lib/finance.ts, costing & royalty engines
// are pure functions — spec requires 100% coverage there). Component tests can
// opt into jsdom per-file with `// @vitest-environment jsdom`.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    globals: true,
    include: ["tests/unit/**/*.{test,spec}.{ts,tsx}", "lib/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules/**", "tests/e2e/**", ".next/**"],
    coverage: {
      provider: "v8",
      reportsDirectory: "./coverage",
      reporter: ["text", "html", "lcov"],
      include: ["lib/**/*.ts"],
      exclude: ["lib/generated/**", "lib/**/*.{test,spec}.ts", "**/*.d.ts"],
    },
  },
});
