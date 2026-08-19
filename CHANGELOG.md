# [0.32.0](https://codeberg.org/bomret/superdev/compare/v0.31.0...v0.32.0) (2026-08-19)


### Features

* **lite:** the lite tier writes its own documentation ([#276](https://codeberg.org/bomret/superdev/issues/276)) ([310c659](https://codeberg.org/bomret/superdev/commit/310c6594865fe8eb6f4da91637e90d256d75c7b3)), closes [#273](https://codeberg.org/bomret/superdev/issues/273) [#274](https://codeberg.org/bomret/superdev/issues/274) [#275](https://codeberg.org/bomret/superdev/issues/275) [#273](https://codeberg.org/bomret/superdev/issues/273) [#274](https://codeberg.org/bomret/superdev/issues/274)

# [0.31.0](https://codeberg.org/bomret/superdev/compare/v0.30.0...v0.31.0) (2026-08-18)


### Bug Fixes

* drift-check covers what it claims about itself ([#269](https://codeberg.org/bomret/superdev/issues/269)) ([803b827](https://codeberg.org/bomret/superdev/commit/803b8272a36d977e54584ce96bb0dcfdbab69390)), closes [#266](https://codeberg.org/bomret/superdev/issues/266) [#265](https://codeberg.org/bomret/superdev/issues/265) [#261](https://codeberg.org/bomret/superdev/issues/261) [#262](https://codeberg.org/bomret/superdev/issues/262)


### Features

* **plan:** declare a slice's domain shapes before its first test ([#271](https://codeberg.org/bomret/superdev/issues/271)) ([219d88b](https://codeberg.org/bomret/superdev/commit/219d88b8533688df7b29ed35aca8f8141693bf80)), closes [#270](https://codeberg.org/bomret/superdev/issues/270)

# [0.30.0](https://codeberg.org/bomret/superdev/compare/v0.29.0...v0.30.0) (2026-08-18)


### Bug Fixes

* **drift-check:** meet a contract clause that wraps across a line ([f93d7a6](https://codeberg.org/bomret/superdev/commit/f93d7a601ecec86bf831564cd0c0710a74cdab86))
* **eval-run:** report a malformed regex grader instead of ending the run ([#253](https://codeberg.org/bomret/superdev/issues/253)) ([dafacbe](https://codeberg.org/bomret/superdev/commit/dafacbe197171c66d44cb43355daf72877f41416))
* **implement:** specify the scope branch per run kind ([#252](https://codeberg.org/bomret/superdev/issues/252)) ([dfb4de2](https://codeberg.org/bomret/superdev/commit/dfb4de24dbcfeefba0a34457fb6d152b51f872a2)), closes [#251](https://codeberg.org/bomret/superdev/issues/251)


### Features

* **drift-check:** pin the sections a canonical reference's readers are sent to ([4577285](https://codeberg.org/bomret/superdev/commit/457728590cf0aae426d9d823e84577515670efe8))
* **plan:** append new slices to a feature that already has them ([#250](https://codeberg.org/bomret/superdev/issues/250)) ([2584511](https://codeberg.org/bomret/superdev/commit/25845110672f1949c63cd1fe9071f5e763a91cb0)), closes [#245](https://codeberg.org/bomret/superdev/issues/245) [#248](https://codeberg.org/bomret/superdev/issues/248) [#247](https://codeberg.org/bomret/superdev/issues/247) [#244](https://codeberg.org/bomret/superdev/issues/244) [#246](https://codeberg.org/bomret/superdev/issues/246) [#249](https://codeberg.org/bomret/superdev/issues/249) [#32](https://codeberg.org/bomret/superdev/issues/32)

# [0.29.0](https://codeberg.org/bomret/superdev/compare/v0.28.2...v0.29.0) (2026-08-15)


### Bug Fixes

* **scope:** read a ledger written with CRLF line endings ([#220](https://codeberg.org/bomret/superdev/issues/220)) ([a85e739](https://codeberg.org/bomret/superdev/commit/a85e739a8d23546d286b62b6ee5126a3e18146fe))


### Features

* **chain:** close the plugin audit's tier 1 defects and tier 3 hardening ([#233](https://codeberg.org/bomret/superdev/issues/233)) ([55ddaad](https://codeberg.org/bomret/superdev/commit/55ddaadf4c3a699828dbab9dd416033e6c81ca38)), closes [#230](https://codeberg.org/bomret/superdev/issues/230) [#231](https://codeberg.org/bomret/superdev/issues/231) [#232](https://codeberg.org/bomret/superdev/issues/232)
* **kb:** extend an aggregate knowledge-base page instead of replacing it ([#241](https://codeberg.org/bomret/superdev/issues/241)) ([9b5cf64](https://codeberg.org/bomret/superdev/commit/9b5cf645be2188b680b977ebc8eeb53dfbeb5d31)), closes [#237](https://codeberg.org/bomret/superdev/issues/237) [#235](https://codeberg.org/bomret/superdev/issues/235) [#236](https://codeberg.org/bomret/superdev/issues/236) [#238](https://codeberg.org/bomret/superdev/issues/238) [#239](https://codeberg.org/bomret/superdev/issues/239) [#240](https://codeberg.org/bomret/superdev/issues/240) [#32](https://codeberg.org/bomret/superdev/issues/32)
* **scope:** record a defect the run leaves standing ([#228](https://codeberg.org/bomret/superdev/issues/228)) ([87e6d76](https://codeberg.org/bomret/superdev/commit/87e6d76baf9c43903c1889072f4b17819e746a9a)), closes [#223](https://codeberg.org/bomret/superdev/issues/223) [#224](https://codeberg.org/bomret/superdev/issues/224) [#225](https://codeberg.org/bomret/superdev/issues/225) [#226](https://codeberg.org/bomret/superdev/issues/226) [#227](https://codeberg.org/bomret/superdev/issues/227)
* **verification:** scope the loop's test runs to the changed paths ([#221](https://codeberg.org/bomret/superdev/issues/221)) ([3c846bd](https://codeberg.org/bomret/superdev/commit/3c846bda3eb7a370772da49e6dfc903daa9db142)), closes [#214](https://codeberg.org/bomret/superdev/issues/214) [#215](https://codeberg.org/bomret/superdev/issues/215) [#216](https://codeberg.org/bomret/superdev/issues/216) [#217](https://codeberg.org/bomret/superdev/issues/217) [#215](https://codeberg.org/bomret/superdev/issues/215) [#216](https://codeberg.org/bomret/superdev/issues/216) [#217](https://codeberg.org/bomret/superdev/issues/217) [#218](https://codeberg.org/bomret/superdev/issues/218)

## [0.28.2](https://codeberg.org/bomret/superdev/compare/v0.28.1...v0.28.2) (2026-08-12)


### Bug Fixes

* **scope:** give the hooks one shared ledger header reader ([#212](https://codeberg.org/bomret/superdev/issues/212)) ([b8a4057](https://codeberg.org/bomret/superdev/commit/b8a405790cf6e4bc64c7e465ac66bbdefb636375)), closes [#209](https://codeberg.org/bomret/superdev/issues/209) [#210](https://codeberg.org/bomret/superdev/issues/210)

## [0.28.1](https://codeberg.org/bomret/superdev/compare/v0.28.0...v0.28.1) (2026-08-11)


### Bug Fixes

* **scope-prune:** recognise a squash-merged scope ([#204](https://codeberg.org/bomret/superdev/issues/204)) ([3f1898e](https://codeberg.org/bomret/superdev/commit/3f1898efade9e0e37d5cde6fb016a01778b04681)), closes [#198](https://codeberg.org/bomret/superdev/issues/198) [#199](https://codeberg.org/bomret/superdev/issues/199)

# [0.28.0](https://codeberg.org/bomret/superdev/compare/v0.27.0...v0.28.0) (2026-08-09)


### Features

* **kb:** make the knowledge-base publish its own command ([#196](https://codeberg.org/bomret/superdev/issues/196)) ([f196ec6](https://codeberg.org/bomret/superdev/commit/f196ec603e394ae423d89f2c01c3dd06dea813a1)), closes [#193](https://codeberg.org/bomret/superdev/issues/193) [#194](https://codeberg.org/bomret/superdev/issues/194) [#195](https://codeberg.org/bomret/superdev/issues/195)
* **scope:** run state owned by a deterministic CLI (scope.js) ([#191](https://codeberg.org/bomret/superdev/issues/191)) ([8cc5756](https://codeberg.org/bomret/superdev/commit/8cc575637f1c3cad0e772a4a17fb0959db9834de)), closes [#187](https://codeberg.org/bomret/superdev/issues/187) [#188](https://codeberg.org/bomret/superdev/issues/188) [#189](https://codeberg.org/bomret/superdev/issues/189) [#190](https://codeberg.org/bomret/superdev/issues/190) [#187](https://codeberg.org/bomret/superdev/issues/187)

# [0.27.0](https://codeberg.org/bomret/superdev/compare/v0.26.1...v0.27.0) (2026-08-05)


* feat!: lead the feature label and scope branch with the change type ([#165](https://codeberg.org/bomret/superdev/issues/165)) ([196d7a5](https://codeberg.org/bomret/superdev/commit/196d7a5c09959617bc3eed49dbbb8d9d1713cc3b))


### Bug Fixes

* **scope:** resolve the scope branch from the ledger and validate both label segments ([#171](https://codeberg.org/bomret/superdev/issues/171)) ([73c66cb](https://codeberg.org/bomret/superdev/commit/73c66cb2f00f7a846c6d72137248e2c454a2defe)), closes [#166](https://codeberg.org/bomret/superdev/issues/166) [#167](https://codeberg.org/bomret/superdev/issues/167) [#168](https://codeberg.org/bomret/superdev/issues/168) [#169](https://codeberg.org/bomret/superdev/issues/169)


### Features

* add the Forgejo store seed and harden the plugin's guard and ledger contracts ([#186](https://codeberg.org/bomret/superdev/issues/186)) ([1dc0dc7](https://codeberg.org/bomret/superdev/commit/1dc0dc72564ccbb2c583eaffc1e93b07661bc12d)), closes [#172](https://codeberg.org/bomret/superdev/issues/172) [#173](https://codeberg.org/bomret/superdev/issues/173) [#183](https://codeberg.org/bomret/superdev/issues/183) [#180](https://codeberg.org/bomret/superdev/issues/180) [#174](https://codeberg.org/bomret/superdev/issues/174) [#185](https://codeberg.org/bomret/superdev/issues/185) [#177](https://codeberg.org/bomret/superdev/issues/177) [#176](https://codeberg.org/bomret/superdev/issues/176)
* **review:** derive the reviewer's own criteria and gate a ceiling note ([#170](https://codeberg.org/bomret/superdev/issues/170)) ([586330b](https://codeberg.org/bomret/superdev/commit/586330b29058d4f9ad32c577480834c46c0c4059)), closes [#163](https://codeberg.org/bomret/superdev/issues/163) [#164](https://codeberg.org/bomret/superdev/issues/164)


### BREAKING CHANGES

* scope branches are named `<type>/<slug>` rather than
`superdev/<slug>`, and feature labels carry a change-type prefix on every slice
store. An in-flight run on a `superdev/*` branch keeps working, but scope-prune
no longer recognises its branch as merged, so its run root needs removing by
hand.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>

## [0.26.1](https://codeberg.org/bomret/superdev/compare/v0.26.0...v0.26.1) (2026-08-03)


### Bug Fixes

* **drift-check:** close the open review findings from feat/afk and feat/scope-anchor ([#161](https://codeberg.org/bomret/superdev/issues/161)) ([d96de2b](https://codeberg.org/bomret/superdev/commit/d96de2b775738417685c86ebabb82f219cfbd7c4)), closes [#128](https://codeberg.org/bomret/superdev/issues/128) [#139](https://codeberg.org/bomret/superdev/issues/139) [#143](https://codeberg.org/bomret/superdev/issues/143) [#144](https://codeberg.org/bomret/superdev/issues/144) [#134](https://codeberg.org/bomret/superdev/issues/134) [#136](https://codeberg.org/bomret/superdev/issues/136) [#145](https://codeberg.org/bomret/superdev/issues/145)

# [0.26.0](https://codeberg.org/bomret/superdev/compare/v0.25.1...v0.26.0) (2026-08-02)


### Bug Fixes

* **afk:** make an unattended sweep safe to run ([#151](https://codeberg.org/bomret/superdev/issues/151)) ([ae29413](https://codeberg.org/bomret/superdev/commit/ae29413f629065ddb2dd35aa75440ad16db7c972)), closes [#146](https://codeberg.org/bomret/superdev/issues/146) [#133](https://codeberg.org/bomret/superdev/issues/133) [#132](https://codeberg.org/bomret/superdev/issues/132)
* **chain:** commit design docs only from the base branch ([#156](https://codeberg.org/bomret/superdev/issues/156)) ([75983b1](https://codeberg.org/bomret/superdev/commit/75983b1f35a2206367ae75c331d4148ffae231d6)), closes [#135](https://codeberg.org/bomret/superdev/issues/135) [#135](https://codeberg.org/bomret/superdev/issues/135)


### Features

* **chain:** record a pass the run did not get ([#155](https://codeberg.org/bomret/superdev/issues/155)) ([f827474](https://codeberg.org/bomret/superdev/commit/f827474a6f12a6731f5c142be264dfb5560743a3)), closes [#152](https://codeberg.org/bomret/superdev/issues/152) [#153](https://codeberg.org/bomret/superdev/issues/153) [#154](https://codeberg.org/bomret/superdev/issues/154)

## [0.25.1](https://codeberg.org/bomret/superdev/compare/v0.25.0...v0.25.1) (2026-08-02)


### Bug Fixes

* **afk:** select scope anchors so single-slice plans are visible ([#148](https://codeberg.org/bomret/superdev/issues/148)) ([e9ba979](https://codeberg.org/bomret/superdev/commit/e9ba97917bb6832b63d9515ecc41a9f7d9c94bc3)), closes [#140](https://codeberg.org/bomret/superdev/issues/140) [#141](https://codeberg.org/bomret/superdev/issues/141) [#146](https://codeberg.org/bomret/superdev/issues/146) [#143](https://codeberg.org/bomret/superdev/issues/143) [#144](https://codeberg.org/bomret/superdev/issues/144) [#143](https://codeberg.org/bomret/superdev/issues/143) [#144](https://codeberg.org/bomret/superdev/issues/144) [#143](https://codeberg.org/bomret/superdev/issues/143) [#144](https://codeberg.org/bomret/superdev/issues/144)

# [0.25.0](https://codeberg.org/bomret/superdev/compare/v0.24.0...v0.25.0) (2026-08-02)


### Features

* **afk:** sweep the planned backlog unattended ([#137](https://codeberg.org/bomret/superdev/issues/137)) ([d2db43b](https://codeberg.org/bomret/superdev/commit/d2db43bc37c292af461abc3ddb5fb5038a68804e)), closes [#131](https://codeberg.org/bomret/superdev/issues/131) [#130](https://codeberg.org/bomret/superdev/issues/130) [#129](https://codeberg.org/bomret/superdev/issues/129) [#136](https://codeberg.org/bomret/superdev/issues/136) [#135](https://codeberg.org/bomret/superdev/issues/135) [#134](https://codeberg.org/bomret/superdev/issues/134) [#133](https://codeberg.org/bomret/superdev/issues/133) [#136](https://codeberg.org/bomret/superdev/issues/136)

# [0.24.0](https://codeberg.org/bomret/superdev/compare/v0.23.0...v0.24.0) (2026-07-31)


### Bug Fixes

* **chain:** re-run the doc pass after a fix cycle, harden the prune gate ([#126](https://codeberg.org/bomret/superdev/issues/126)) ([cfa09d4](https://codeberg.org/bomret/superdev/commit/cfa09d4cffc2fe55cf792568243479b304e00972)), closes [#124](https://codeberg.org/bomret/superdev/issues/124) [#125](https://codeberg.org/bomret/superdev/issues/125)


### Features

* **docs:** configurable, language-neutral writing standard for the doc agents ([#110](https://codeberg.org/bomret/superdev/issues/110)) ([6cb27bc](https://codeberg.org/bomret/superdev/commit/6cb27bcdb146c47981b8725cab0a9f49016ff9b9)), closes [#107](https://codeberg.org/bomret/superdev/issues/107) [#108](https://codeberg.org/bomret/superdev/issues/108)
* **evals:** validate grader shape and score operation coverage ([#115](https://codeberg.org/bomret/superdev/issues/115)) ([1982490](https://codeberg.org/bomret/superdev/commit/1982490eb59e824c12dafc023c61600c9f36be1f))
* **implement:** disentangle the implement tail into a four-command chain ([#122](https://codeberg.org/bomret/superdev/issues/122)) ([7aec5f3](https://codeberg.org/bomret/superdev/commit/7aec5f3c9b4d1b4b58c5294201667f3048340e95)), closes [#113](https://codeberg.org/bomret/superdev/issues/113) [#112](https://codeberg.org/bomret/superdev/issues/112) [#114](https://codeberg.org/bomret/superdev/issues/114)
* **plan:** assign every issue a run creates to the store's configured account ([#98](https://codeberg.org/bomret/superdev/issues/98)) ([0bc5aaf](https://codeberg.org/bomret/superdev/commit/0bc5aafe9ad6cdab24ac2fbe3848f5f3e9422788)), closes [#97](https://codeberg.org/bomret/superdev/issues/97)
* **references:** extend controlled prose with five Handbook rules ([#127](https://codeberg.org/bomret/superdev/issues/127)) ([718898c](https://codeberg.org/bomret/superdev/commit/718898cfba0ca794907c714bec2415d9cb60b97e))
* **setup:** add GitHub Issues as a first-class slice store ([#102](https://codeberg.org/bomret/superdev/issues/102)) ([ceaae00](https://codeberg.org/bomret/superdev/commit/ceaae0091e213e32fec902e153b8adc84137539f))

# [0.23.0](https://codeberg.org/bomret/superdev/compare/v0.22.0...v0.23.0) (2026-07-30)


### Features

* **plan:** draw the slice graph and touch map when a plan earns them ([#94](https://codeberg.org/bomret/superdev/issues/94)) ([37362ab](https://codeberg.org/bomret/superdev/commit/37362abb6460331411f0ace9f9c0be3776b5b20c)), closes [#91](https://codeberg.org/bomret/superdev/issues/91) [#92](https://codeberg.org/bomret/superdev/issues/92) [#93](https://codeberg.org/bomret/superdev/issues/93)

# [0.22.0](https://codeberg.org/bomret/superdev/compare/v0.21.0...v0.22.0) (2026-07-24)


### Bug Fixes

* **implement:** address run-root artifacts by absolute path ([#85](https://codeberg.org/bomret/superdev/issues/85)) ([f7d700a](https://codeberg.org/bomret/superdev/commit/f7d700a5f8b523693af5c94520d8e1b9250c72ae)), closes [#84](https://codeberg.org/bomret/superdev/issues/84)


### Features

* enumerate domain-level edge cases at plan time and share the test smells ([#90](https://codeberg.org/bomret/superdev/issues/90)) ([8feb817](https://codeberg.org/bomret/superdev/commit/8feb817377fb249d2dd49d05fc65aa65fb65a5b5)), closes [#87](https://codeberg.org/bomret/superdev/issues/87) [#88](https://codeberg.org/bomret/superdev/issues/88)

# [0.21.0](https://codeberg.org/bomret/superdev/compare/v0.20.0...v0.21.0) (2026-07-22)


### Features

* tick DoD boxes on confirm and delete seeded brainstorm intents ([#83](https://codeberg.org/bomret/superdev/issues/83)) ([e51cd61](https://codeberg.org/bomret/superdev/commit/e51cd6194d8b78bb4ab4ee80b4dd2b2aca66c42d))

# [0.20.0](https://codeberg.org/bomret/superdev/compare/v0.19.0...v0.20.0) (2026-07-21)


### Bug Fixes

* **plan:** make AskUserQuestion the default surface for optioned questions ([04e66e4](https://codeberg.org/bomret/superdev/commit/04e66e43ff3870ece61bf84d3c7d01e855e537b4))


### Features

* **document:** add brownfield bootstrap mode for /superdev:document ([#80](https://codeberg.org/bomret/superdev/issues/80)) ([1a7ff65](https://codeberg.org/bomret/superdev/commit/1a7ff65460c093b7d3c4f42a4184b83b15120dfd)), closes [#79](https://codeberg.org/bomret/superdev/issues/79)
* fix review findings and harden the doc loop against drift ([#78](https://codeberg.org/bomret/superdev/issues/78)) ([1ea87c2](https://codeberg.org/bomret/superdev/commit/1ea87c2cd5ea85b280480c7b3cda9579186f0232)), closes [#70](https://codeberg.org/bomret/superdev/issues/70) [#77](https://codeberg.org/bomret/superdev/issues/77) [#75](https://codeberg.org/bomret/superdev/issues/75) [#74](https://codeberg.org/bomret/superdev/issues/74) [#71](https://codeberg.org/bomret/superdev/issues/71) [#73](https://codeberg.org/bomret/superdev/issues/73) [#72](https://codeberg.org/bomret/superdev/issues/72) [#76](https://codeberg.org/bomret/superdev/issues/76)
* **plan:** seed interview from existing brainstorm intent ([18b3e95](https://codeberg.org/bomret/superdev/commit/18b3e95b526b0df622154d4d21a34f03b2bfcbc9))
* **setup:** discover and record repo toolchain in docs/agents/toolchain.md ([#82](https://codeberg.org/bomret/superdev/issues/82)) ([a8509c7](https://codeberg.org/bomret/superdev/commit/a8509c760fbf37ed76aac1f983d0a0e0a02f50e2)), closes [#81](https://codeberg.org/bomret/superdev/issues/81)

# [0.19.0](https://codeberg.org/bomret/superdev/compare/v0.18.0...v0.19.0) (2026-07-21)


### Features

* **review:** reframe final-reviewer around five adversarial axes ([#68](https://codeberg.org/bomret/superdev/issues/68)) ([f9dadca](https://codeberg.org/bomret/superdev/commit/f9dadca2b72ea6793c46d366d4df89203eea5132))

# [0.18.0](https://codeberg.org/bomret/superdev/compare/v0.17.0...v0.18.0) (2026-07-15)


### Features

* reader-test reconciled docs with fresh-context doc-reader ([d2c990c](https://codeberg.org/bomret/superdev/commit/d2c990cd4d96e6e1b8ccf34811518845e1cf38b2))

# [0.17.0](https://codeberg.org/bomret/superdev/compare/v0.16.0...v0.17.0) (2026-07-14)


### Features

* harden guard hooks, slim always-on prompt cost, add adversarial review lenses ([79ee41a](https://codeberg.org/bomret/superdev/commit/79ee41ac89e7681bd5df1be6a3216b649acc0dbe))

# [0.16.0](https://codeberg.org/bomret/superdev/compare/v0.15.0...v0.16.0) (2026-07-12)


### Features

* **hooks:** nest .superdev run roots under scopes/, auto-prune completed ones ([3b8fbf4](https://codeberg.org/bomret/superdev/commit/3b8fbf4215373f7883e08fbb7ab9c49a4fb2cedb))

# [0.15.0](https://codeberg.org/bomret/superdev/compare/v0.14.4...v0.15.0) (2026-07-10)


### Features

* **references:** add doc-verification discipline ([874bb9c](https://codeberg.org/bomret/superdev/commit/874bb9cc81429eb9668473d909933087436949cc))

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
