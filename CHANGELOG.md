## [0.14.4](https://codeberg.org/bomret/superdev/compare/v0.14.3...v0.14.4) (2026-07-10)


### Bug Fixes

* **brainstorm:** rename skateboard to Minimal Lovable Product (MLP) ([04b2b4a](https://codeberg.org/bomret/superdev/commit/04b2b4a4a096a530bc1f974ba44f694a45865edb))

## [0.14.3](https://codeberg.org/bomret/superdev/compare/v0.14.2...v0.14.3) (2026-07-09)


### Bug Fixes

* **context:** rename PRD to feature specification across knowledge-base docs ([fe0124e](https://codeberg.org/bomret/superdev/commit/fe0124ea3910e94ceb3bb3cc57bf521081073a5b))

## [0.14.2](https://codeberg.org/bomret/superdev/compare/v0.14.1...v0.14.2) (2026-07-09)


### Bug Fixes

* **plan:** pin per-slice test interface, flag tautological tests, standardize on specification ([63f097b](https://codeberg.org/bomret/superdev/commit/63f097bca4911529b70be00f7e4f84c5d58b7ffa))

## [0.14.1](https://codeberg.org/bomret/superdev/compare/v0.14.0...v0.14.1) (2026-07-09)


### Bug Fixes

* **context:** correct contradictory glossary/spec claims, rename grilling to cross-examination ([4d7f738](https://codeberg.org/bomret/superdev/commit/4d7f738c0c5cc021a422c1139f3f1cc2d4a4fbc2))

# [0.14.0](https://codeberg.org/bomret/superdev/compare/v0.13.0...v0.14.0) (2026-07-08)


### Bug Fixes

* **plan:** push base-branch design-doc commits before the scope PR ([769163e](https://codeberg.org/bomret/superdev/commit/769163ed48833e456b996596f22944d833156533))


### Features

* **review:** add rule-compliance lens + review report sharpening ([#65](https://codeberg.org/bomret/superdev/issues/65)) ([b6f6ea6](https://codeberg.org/bomret/superdev/commit/b6f6ea60e61e29b4c4f0a542c6cda2747bdd5b04)), closes [#63](https://codeberg.org/bomret/superdev/issues/63) [#64](https://codeberg.org/bomret/superdev/issues/64)

# [0.13.0](https://codeberg.org/bomret/superdev/compare/v0.12.0...v0.13.0) (2026-07-06)


### Bug Fixes

* **agents:** pin implementer/reviewer/doc-writer to Sonnet 4.6 ([eb93dd9](https://codeberg.org/bomret/superdev/commit/eb93dd9298ad5e2950ed66bf0af904384c284b74))


### Features

* **plan:** tie recommended-answer rule to AskUserQuestion ([#59](https://codeberg.org/bomret/superdev/issues/59)) ([ac5869e](https://codeberg.org/bomret/superdev/commit/ac5869edf9678698b1723b5b6f19e2cbf5f83208)), closes [#58](https://codeberg.org/bomret/superdev/issues/58)
* **review:** fold code-review-skill checklists into reviewer agents ([#57](https://codeberg.org/bomret/superdev/issues/57)) ([d187817](https://codeberg.org/bomret/superdev/commit/d18781799ee501ee55d6273e7e64ec11c7acfc82)), closes [#54](https://codeberg.org/bomret/superdev/issues/54) [#55](https://codeberg.org/bomret/superdev/issues/55) [#56](https://codeberg.org/bomret/superdev/issues/56)

# [0.12.0](https://codeberg.org/bomret/superdev/compare/v0.11.0...v0.12.0) (2026-07-04)


### Bug Fixes

* **hooks,agents:** close guard bypasses + implement injection mitigation from review ([#53](https://codeberg.org/bomret/superdev/issues/53)) ([6125b9b](https://codeberg.org/bomret/superdev/commit/6125b9b5427d8252b4860f09568f18c361570678)), closes [#32](https://codeberg.org/bomret/superdev/issues/32)
* **implement:** de-interleave into tier playbooks + serial doc reconcile ([#49](https://codeberg.org/bomret/superdev/issues/49)) ([d227c0c](https://codeberg.org/bomret/superdev/commit/d227c0ca9fe4b5df6e2640d6ca9fc44072e1daaf)), closes [#48](https://codeberg.org/bomret/superdev/issues/48)


### Features

* **authoring:** deepen /plan + /brainstorm to skill-depth via shared references ([#52](https://codeberg.org/bomret/superdev/issues/52)) ([c24568d](https://codeberg.org/bomret/superdev/commit/c24568da15a1ff6ce50adbc794501e1bf8a79d1d))
* **plan:** harden authoring + review prompts ([#51](https://codeberg.org/bomret/superdev/issues/51)) ([6b7be0b](https://codeberg.org/bomret/superdev/commit/6b7be0b85735cb577c4fbc3a2f61acb757900cfc))

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
