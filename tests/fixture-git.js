'use strict';

// Appends `commit.gpgsign=false` to git's env-injected config, keeping any GIT_CONFIG_* entry the
// environment already carries (e.g. a CI-injected safe.directory). Idempotent across repeated requires.
if (!process.env.GIT_FIXTURE_GPGSIGN) {
  const i = Number(process.env.GIT_CONFIG_COUNT || 0);
  process.env[`GIT_CONFIG_KEY_${i}`] = 'commit.gpgsign';
  process.env[`GIT_CONFIG_VALUE_${i}`] = 'false';
  process.env.GIT_CONFIG_COUNT = String(i + 1);
  process.env.GIT_FIXTURE_GPGSIGN = '1';
}
