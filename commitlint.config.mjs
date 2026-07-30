/**
 * Conventional Commits are load-bearing here: release-please derives the version
 * bump and CHANGELOG from commit types, so a malformed subject silently drops a
 * change out of the release notes.
 */
const config = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "subject-case": [2, "never", ["upper-case", "pascal-case", "start-case"]],
    "header-max-length": [2, "always", 72],
    "body-max-line-length": [2, "always", 100],
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "perf",
        "refactor",
        "docs",
        "test",
        "build",
        "ci",
        "chore",
        "style",
        "revert",
        "deps",
      ],
    ],
  },
};

export default config;
