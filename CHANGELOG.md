# [0.7.0](https://codeberg.org/bomret/superdev/compare/v0.6.0...v0.7.0) (2026-07-03)


### Features

* token discipline in subagent bodies ([#14](https://codeberg.org/bomret/superdev/issues/14)) ([b532d88](https://codeberg.org/bomret/superdev/commit/b532d88448fcd89fd0f11eb1d86d155cba59f065)), closes [#12](https://codeberg.org/bomret/superdev/issues/12)

# [0.6.0](https://codeberg.org/bomret/superdev/compare/v0.5.0...v0.6.0) (2026-07-03)


### Features

* /superdev:review — standalone review command ([#11](https://codeberg.org/bomret/superdev/issues/11)) ([3f2d2a1](https://codeberg.org/bomret/superdev/commit/3f2d2a1427391fe7eee06f6cc4fa3af1b6f34958)), closes [#9](https://codeberg.org/bomret/superdev/issues/9)

# [0.5.0](https://codeberg.org/bomret/superdev/compare/v0.4.2...v0.5.0) (2026-07-03)


### Features

* self-improvements scope — /superdev:status, eval harness, parallelism cap, resume section, worked example ([a40719e](https://codeberg.org/bomret/superdev/commit/a40719ee00da066320a6fd1e019dc8801ae2a23f)), closes [#8](https://codeberg.org/bomret/superdev/issues/8)

## [0.4.2](https://codeberg.org/bomret/superdev/compare/v0.4.1...v0.4.2) (2026-07-03)


### Bug Fixes

* **hooks:** merge-guard no longer false-positives on git merge-base ([9b64d49](https://codeberg.org/bomret/superdev/commit/9b64d492c7df7c762f46ee738b27400cb1ff6594))

## [0.4.1](https://codeberg.org/bomret/superdev/compare/v0.4.0...v0.4.1) (2026-07-03)


### Bug Fixes

* **hooks:** worktree-sweep only sweeps merged AND worked slice branches ([844c96b](https://codeberg.org/bomret/superdev/commit/844c96b62d07f9a1ce7f231616489f00178a1e38))

# [0.4.0](https://codeberg.org/bomret/superdev/compare/v0.3.1...v0.4.0) (2026-07-03)


### Bug Fixes

* **implement:** namespace run artifacts + slice branches per scope ([8e1e66c](https://codeberg.org/bomret/superdev/commit/8e1e66ce408636d59c244bb9afb0242995fed4c5))


### Features

* add /superdev:upgrade self-upgrade command ([6080500](https://codeberg.org/bomret/superdev/commit/608050005328d6e5164514222c18e96420c15ebc))
* **hooks:** worktree-sweep Stop hook — deterministic worktree cleanup ([caf8c12](https://codeberg.org/bomret/superdev/commit/caf8c1213c5b21d3583416bb72261df60870f129))
* **implement:** final worktree sweep after the PR ([0e66014](https://codeberg.org/bomret/superdev/commit/0e6601449bf68e628478acb96ee0c50adf9d1ec6))
* **implement:** per-slice progress log the controller guarantees ([8e674fe](https://codeberg.org/bomret/superdev/commit/8e674fe0d0c006b5b5c8b0a845692b0cd1a818a4))

## [0.3.1](https://codeberg.org/bomret/superdev/compare/v0.3.0...v0.3.1) (2026-07-02)


### Bug Fixes

* drop manifest hooks field (Claude Code auto-loads hooks/hooks.json) ([000af2b](https://codeberg.org/bomret/superdev/commit/000af2bf29094f4c218886698f8df1ef0b2babad))

# [0.3.0](https://codeberg.org/bomret/superdev/compare/v0.2.0...v0.3.0) (2026-07-02)


### Features

* **hooks:** SessionStart update-check + document updating ([bbdf9b3](https://codeberg.org/bomret/superdev/commit/bbdf9b3ca24018a98439897a0aa248cca2e47466))
* walk issues along the tracker's status workflow ([145b41d](https://codeberg.org/bomret/superdev/commit/145b41da107671fa6c3a3eeec6946a97d82bcbd6))
