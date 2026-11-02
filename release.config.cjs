/* eslint-env node */

/** @type {import('semantic-release').GlobalConfig} */
module.exports = {
  branches: ['main'],
  plugins: [
    [
      '@semantic-release/commit-analyzer',
      {
        // Pre-1.0 policy: superdev stays below 1.0.0 until it has proven itself in real
        // use, so a breaking change bumps the minor, not the major. Remove this rule to
        // let the first deliberate 1.0.0 happen.
        releaseRules: [{ breaking: true, release: 'minor' }],
      },
    ],
    [
      'semantic-release-replace-plugin',
      {
        replacements: [
          {
            // plugin.json is the single source of truth for the plugin version;
            // marketplace.json carries none.
            files: ['plugin/.claude-plugin/plugin.json'],
            from: '"version": ".*"',
            to: '"version": "${nextRelease.version}"',
            results: [
              {
                file: 'plugin/.claude-plugin/plugin.json',
                hasChanged: true,
                numMatches: 1,
                numReplacements: 1,
              },
            ],
            countMatches: true,
          },
          {
            // The marketplace source pins the release tag (ADR 0131), so the release commit
            // names its own tag.
            files: ['.claude-plugin/marketplace.json'],
            from: '"ref": "v[^"]*"',
            to: '"ref": "v${nextRelease.version}"',
            results: [
              {
                file: '.claude-plugin/marketplace.json',
                hasChanged: true,
                numMatches: 1,
                numReplacements: 1,
              },
            ],
            countMatches: true,
          },
        ],
      },
    ],
    '@semantic-release/release-notes-generator',
    [
      '@semantic-release/changelog',
      {
        changelogFile: 'CHANGELOG.md',
      },
    ],
    [
      '@semantic-release/git',
      {
        assets: ['CHANGELOG.md', 'plugin/.claude-plugin/plugin.json', '.claude-plugin/marketplace.json'],
        message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
      },
    ],
    [
      '@semantic-release/github',
      {
        // A local release posts nothing on the issues and pull requests it ships.
        successComment: false,
        failComment: false,
        releasedLabels: false,
      },
    ],
  ],
}
