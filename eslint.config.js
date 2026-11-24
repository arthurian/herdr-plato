// ESLint for the plato mod: catches undefined and unused names, which `herdr-app check`
// misses in code it does not run (a click, a close). Run with `npm run lint`.
import js from "@eslint/js";

export default [
  { ignores: ["**/gpui-kit.d.ts", "node_modules/"] },
  js.configs.recommended,
  {
    // The mod runs in Herdr: "herdr", "gpui-kit" and "gpui-base" are its imports, and these are
    // the globals that Herdr's gpui-kit.d.ts declares.
    files: ["mods/plato/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { console: "readonly", fetch: "readonly", process: "readonly", window: "readonly", localStorage: "readonly", sessionStorage: "readonly" },
    },
  },
  {
    // The logic tests run in Node.
    files: ["mods/plato/test/*.mjs", "eslint.config.js"],
    languageOptions: { ecmaVersion: "latest", sourceType: "module", globals: { console: "readonly", URL: "readonly", process: "readonly" } },
  },
  {
    rules: {
      // An unused argument such as _p or (_e, cx) keeps a signature readable.
      "no-unused-vars": ["error", { args: "none", caughtErrors: "none" }],
    },
  },
];
