# [0.11.0](https://codeberg.org/bomret/superdev/compare/v0.10.1...v0.11.0) (2026-07-04)


### Features

* **implement, hooks:** parallel-safe lite runs — scope worktree + run-lock ([#42](https://codeberg.org/bomret/superdev/issues/42)) ([d17ea85](https://codeberg.org/bomret/superdev/commit/d17ea85d32d5a2b1fb920cf7db0f5e087771bfc0)), closes [#39](https://codeberg.org/bomret/superdev/issues/39) [#40](https://codeberg.org/bomret/superdev/issues/40)

## [0.10.1](https://codeberg.org/bomret/superdev/compare/v0.10.0...v0.10.1) (2026-07-04)


### Bug Fixes

* **implement:** key run root on bare slug to avoid .superdev/superdev nesting ([#38](https://codeberg.org/bomret/superdev/issues/38)) ([2d3820d](https://codeberg.org/bomret/superdev/commit/2d3820d13a4b8fe009066f9c29333be4abdcc378))

# [0.10.0](https://codeberg.org/bomret/superdev/compare/v0.9.0...v0.10.0) (2026-07-04)


### Features

* lite execution tier for /superdev:implement ([#30](https://codeberg.org/bomret/superdev/issues/30)) ([b3cce1e](https://codeberg.org/bomret/superdev/commit/b3cce1e92d45f0531cba2164fefc936777c6323d)), closes [#29](https://codeberg.org/bomret/superdev/issues/29)

# [0.9.0](https://codeberg.org/bomret/superdev/compare/v0.8.0...v0.9.0) (2026-07-04)


### Features

* /superdev:brainstorm — discovery front-end for vague ideas ([#20](https://codeberg.org/bomret/superdev/issues/20)) ([5281c06](https://codeberg.org/bomret/superdev/commit/5281c06a87dfad713466df5917815388902e9127)), closes [#18](https://codeberg.org/bomret/superdev/issues/18)
* cap the per-slice fix loop at 3 strikes ([041c511](https://codeberg.org/bomret/superdev/commit/041c511e063a5e76b2676f544c4a51c5a0157698))
* optional epic for single-slice plans (+ Haiku for status/upgrade) ([#24](https://codeberg.org/bomret/superdev/issues/24)) ([8aaa281](https://codeberg.org/bomret/superdev/commit/8aaa2819494da6e15db58779e92fcb956ddc0920)), closes [21/#22](https://codeberg.org/bomret/superdev/issues/22)
* revise recorded decisions when the interview overturns them ([#26](https://codeberg.org/bomret/superdev/issues/26)) ([05b8574](https://codeberg.org/bomret/superdev/commit/05b8574b79ad86ad12aab5fdb7757ca65c977aa4))


### Performance Improvements

* run status and upgrade commands on Haiku ([#23](https://codeberg.org/bomret/superdev/issues/23)) ([53fc00a](https://codeberg.org/bomret/superdev/commit/53fc00af8c09118934270a17045103e761ca1d74))

# [0.8.0](https://codeberg.org/bomret/superdev/compare/v0.7.0...v0.8.0) (2026-07-03)


### Features

* secret hygiene in subagent bodies ([#17](https://codeberg.org/bomret/superdev/issues/17)) ([caa5c00](https://codeberg.org/bomret/superdev/commit/caa5c00189a0a1867bdf1ba107dba9a49cca4638)), closes [#15](https://codeberg.org/bomret/superdev/issues/15)

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
