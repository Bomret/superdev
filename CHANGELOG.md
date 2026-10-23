## [0.82.1](https://codeberg.org/bomret/superdev/compare/v0.82.0...v0.82.1) (2026-10-23)


### Bug Fixes

* **run-tests:** a .md name selects a suite only in an anchored path ([58038d8](https://codeberg.org/bomret/superdev/commit/58038d8f3e49e94a71bda46292b42a0684d374b9))
* **run-tests:** a bare relative directory literal names no repo directory ([a2119a7](https://codeberg.org/bomret/superdev/commit/a2119a75eadb35eacf3ace3e3531a3dfc39dc6ff))
* **run-tests:** narrow --related selection for release tooling and markdown citations ([4d33f99](https://codeberg.org/bomret/superdev/commit/4d33f9939f3bc0b29413b6ab6a0ea86dda5f2e86))

# [0.82.0](https://codeberg.org/bomret/superdev/compare/v0.81.0...v0.82.0) (2026-10-23)


### Features

* **publish-kb:** link flat-wiki pages from their parent ([bf1aaee](https://codeberg.org/bomret/superdev/commit/bf1aaee605b61e3d042a05b9f3c2acffbac688ab))

# [0.81.0](https://codeberg.org/bomret/superdev/compare/v0.80.0...v0.81.0) (2026-10-23)


### Bug Fixes

* **release:** take the Codeberg token from FORGEJO_TOKEN when GITEA_TOKEN is unset ([#1333](https://codeberg.org/bomret/superdev/issues/1333)) ([606f245](https://codeberg.org/bomret/superdev/commit/606f2455b73c3c12099885fc76cd4d61fcef5967))


### Features

* **skills:** remove the profile and prose-check commands ([#1332](https://codeberg.org/bomret/superdev/issues/1332)) ([ca171df](https://codeberg.org/bomret/superdev/commit/ca171df191b5ba2bb292292c9b8dd0d0f3eec12b))

# [0.80.0](https://codeberg.org/bomret/superdev/compare/v0.79.0...v0.80.0) (2026-10-23)


### Features

* **plan:** push the scope branch at the end of every plan run ([1b86962](https://codeberg.org/bomret/superdev/commit/1b869629adfe4254c83045dee25bd3d8739162eb))

# [0.79.0](https://codeberg.org/bomret/superdev/compare/v0.78.0...v0.79.0) (2026-10-23)


### Bug Fixes

* **adr:** renumber the tests-through-node ADR from 0162 to 0166 ([#1294](https://codeberg.org/bomret/superdev/issues/1294)) ([008f3a7](https://codeberg.org/bomret/superdev/commit/008f3a70f9e1b5ca2d3b3b5221314f9571c2c0e4)), closes [tests-throu#node](https://codeberg.org/tests-throu/issues/node)
* **run-tests:** stop fixture joins and shared basenames from selecting suites ([#1314](https://codeberg.org/bomret/superdev/issues/1314)) ([d9fd476](https://codeberg.org/bomret/superdev/commit/d9fd4768930278b732805e16769928d75f8f159a))


### Features

* **review:** judge prompt-concept overlap by rule equivalence ([#1313](https://codeberg.org/bomret/superdev/issues/1313)) ([599f58b](https://codeberg.org/bomret/superdev/commit/599f58b7a8c3d8acfbc5f946b052bd2209588226))
* **review:** resolve a top-level path as no argument ([#1312](https://codeberg.org/bomret/superdev/issues/1312)) ([d045b0e](https://codeberg.org/bomret/superdev/commit/d045b0ef3e6b831b0b50dc8f7bbe36a0b9a66d4b))
* **status:** carry the backlog survey and read run liveness ([#1284](https://codeberg.org/bomret/superdev/issues/1284)) ([9d841fe](https://codeberg.org/bomret/superdev/commit/9d841fea7ca93fb615b55314229041890149e380))

# [0.78.0](https://codeberg.org/bomret/superdev/compare/v0.77.0...v0.78.0) (2026-10-21)


### Features

* **review-tests:** audit test gaps beside test cost ([#1276](https://codeberg.org/bomret/superdev/issues/1276)) ([f6c0079](https://codeberg.org/bomret/superdev/commit/f6c00798ea4d5d24a4cef8a5d0fdb4454b821a4b))

# [0.77.0](https://codeberg.org/bomret/superdev/compare/v0.76.0...v0.77.0) (2026-10-20)


### Bug Fixes

* **scope:** the fail-to-pass suite's bound checks hold under load ([#1271](https://codeberg.org/bomret/superdev/issues/1271)) ([f21ac0a](https://codeberg.org/bomret/superdev/commit/f21ac0aa7ef8a3ed8ffc5f8532bbe0d3c9204a07))


### Features

* **setup:** store and show the assignee's display name ([#1269](https://codeberg.org/bomret/superdev/issues/1269)) ([c1075a9](https://codeberg.org/bomret/superdev/commit/c1075a9163fd13829226565af3d07cfded47dfae))

# [0.76.0](https://codeberg.org/bomret/superdev/compare/v0.75.1...v0.76.0) (2026-10-18)


### Features

* **review:** settle docs-tagged Definition-of-Done criteria in the doc pass ([#1251](https://codeberg.org/bomret/superdev/issues/1251)) ([7666607](https://codeberg.org/bomret/superdev/commit/7666607967bc55d832e637b1cceff7e062251e3f))

## [0.75.1](https://codeberg.org/bomret/superdev/compare/v0.75.0...v0.75.1) (2026-10-17)


### Bug Fixes

* **hooks:** merge-guard denies integrations behind wrapper value options and inline aliases over guarded verbs ([#1239](https://codeberg.org/bomret/superdev/issues/1239)) ([629a305](https://codeberg.org/bomret/superdev/commit/629a3052344c73aa97379f4ace5ca2618a483813))
* **hooks:** run-trace reads wrappers, directories, git options, and words the way bash does ([#1243](https://codeberg.org/bomret/superdev/issues/1243)) ([e8b7be4](https://codeberg.org/bomret/superdev/commit/e8b7be46cbcc7f384ae9f1d0d318b22f4e973330))
* **hooks:** run-trace resolves Bash commands from their starting directory and records no run for reading commands ([#1231](https://codeberg.org/bomret/superdev/issues/1231)) ([6311f95](https://codeberg.org/bomret/superdev/commit/6311f95ebfa03aba3ea5d8a9febe899fd2ae883b))

# [0.75.0](https://codeberg.org/bomret/superdev/compare/v0.74.1...v0.75.0) (2026-10-16)


### Bug Fixes

* **jira:** write Blocks links with the blocker as inwardIssue ([#1222](https://codeberg.org/bomret/superdev/issues/1222)) ([f97dd24](https://codeberg.org/bomret/superdev/commit/f97dd248a0cee006ba2388d83953da686d9d4d0b))


### Features

* **skills:** every chain command offers to start its successor ([#1221](https://codeberg.org/bomret/superdev/issues/1221)) ([9e47f5e](https://codeberg.org/bomret/superdev/commit/9e47f5e736f29ec749f4aabf464f5625b91c58a7))


### Performance Improvements

* **plan:** dispatch derive mode in the background with no Definition of Done ([#1220](https://codeberg.org/bomret/superdev/issues/1220)) ([d612211](https://codeberg.org/bomret/superdev/commit/d6122117b8fa0d39a8838142a6ef2be7cd07a182))

## [0.74.1](https://codeberg.org/bomret/superdev/compare/v0.74.0...v0.74.1) (2026-10-15)


### Bug Fixes

* **verification:** class only the drift selftest and contract tables as test paths ([#1208](https://codeberg.org/bomret/superdev/issues/1208)) ([e07cc3a](https://codeberg.org/bomret/superdev/commit/e07cc3aa4de5a4179873975e74caca19195cb5b7)), closes [#1156](https://codeberg.org/bomret/superdev/issues/1156) [#1156](https://codeberg.org/bomret/superdev/issues/1156) [#1132](https://codeberg.org/bomret/superdev/issues/1132) [#1206](https://codeberg.org/bomret/superdev/issues/1206)


### Performance Improvements

* **hooks:** slice merges run no test suite ([#1209](https://codeberg.org/bomret/superdev/issues/1209)) ([ea80487](https://codeberg.org/bomret/superdev/commit/ea80487cfc019b5644c19340f484290b630be7b8))

# [0.74.0](https://codeberg.org/bomret/superdev/compare/v0.73.0...v0.74.0) (2026-10-15)


### Bug Fixes

* **adr:** renumber the duplicate maintainer-documents ADR 0150 to 0156 ([#1207](https://codeberg.org/bomret/superdev/issues/1207)) ([95e801f](https://codeberg.org/bomret/superdev/commit/95e801f36d9cbd14166d3153ba596d4680275e24))
* **implement:** let the operator name the slices that fix a red base gate ([ee39ad3](https://codeberg.org/bomret/superdev/commit/ee39ad35122bd20f8fbfbb28148c713ddd71c936))


### Features

* **drift:** fail the test run when two maintainer documents disagree on one fact ([#1188](https://codeberg.org/bomret/superdev/issues/1188)) ([ddcf1bd](https://codeberg.org/bomret/superdev/commit/ddcf1bdaed1f7d272143bde9d0386141de60fb3b)), closes [#1136](https://codeberg.org/bomret/superdev/issues/1136) [#1132](https://codeberg.org/bomret/superdev/issues/1132) [#1133](https://codeberg.org/bomret/superdev/issues/1133) [#1135](https://codeberg.org/bomret/superdev/issues/1135) [#489](https://codeberg.org/bomret/superdev/issues/489) [#971](https://codeberg.org/bomret/superdev/issues/971) [#489](https://codeberg.org/bomret/superdev/issues/489) [#1136](https://codeberg.org/bomret/superdev/issues/1136) [#1132](https://codeberg.org/bomret/superdev/issues/1132) [#1134](https://codeberg.org/bomret/superdev/issues/1134) [#1134](https://codeberg.org/bomret/superdev/issues/1134) [#1136](https://codeberg.org/bomret/superdev/issues/1136) [#1133](https://codeberg.org/bomret/superdev/issues/1133) [#1034](https://codeberg.org/bomret/superdev/issues/1034) [#1135](https://codeberg.org/bomret/superdev/issues/1135) [#1132](https://codeberg.org/bomret/superdev/issues/1132) [#1133](https://codeberg.org/bomret/superdev/issues/1133)

# [0.73.0](https://codeberg.org/bomret/superdev/compare/v0.72.0...v0.73.0) (2026-10-14)


### Bug Fixes

* **run-tests:** run the superdev-view mod suite in a focused run that reaches the mod ([#1178](https://codeberg.org/bomret/superdev/issues/1178)) ([6d563a2](https://codeberg.org/bomret/superdev/commit/6d563a2fdbd7b9bb5521d8886ffd55ba51f7d530))


### Features

* **hooks:** superdev runs on Windows with Git Bash ([c7b428b](https://codeberg.org/bomret/superdev/commit/c7b428b15c662b839ceaad63011b7ab24117e936))

# [0.72.0](https://codeberg.org/bomret/superdev/compare/v0.71.0...v0.72.0) (2026-10-13)


### Bug Fixes

* **hooks:** refuse a dispatched implementer's file-tool write outside .superdev/ ([#1129](https://codeberg.org/bomret/superdev/issues/1129)) ([d53e431](https://codeberg.org/bomret/superdev/commit/d53e431ca25a64fd10ff10d71462ea18e15cfac1))


### Features

* **superdev-view:** draw each slice as a collapsible group and each dispatch run as one line ([#1130](https://codeberg.org/bomret/superdev/issues/1130)) ([f777c1c](https://codeberg.org/bomret/superdev/commit/f777c1c40610d7cf4269298e9b17734ef60fb13c))

# [0.71.0](https://codeberg.org/bomret/superdev/compare/v0.70.1...v0.71.0) (2026-10-12)


### Bug Fixes

* **kb:** find reads every wiki listing page before it answers absent ([#1103](https://codeberg.org/bomret/superdev/issues/1103)) ([626b892](https://codeberg.org/bomret/superdev/commit/626b892a6e0f1ba81ef52d41ab19202b2bd2113c))
* **scope:** the fail-to-pass bound has a floor of 10 seconds ([6a5b5aa](https://codeberg.org/bomret/superdev/commit/6a5b5aa5680cbd3079b04274faed320f95c9ac21))


### Features

* **plan:** absorb open triage records, and a triage write joins a matching one ([d4df17a](https://codeberg.org/bomret/superdev/commit/d4df17a654965c9368082913d84dd3f54144aa3a))
* **profile:** name a scope run's time sinks ([fa64f8e](https://codeberg.org/bomret/superdev/commit/fa64f8e49f1e950c9a8fc2c620ee7195e262760a))
* **scope:** every chain command records its start and its end, and the event log draws them ([c00b85a](https://codeberg.org/bomret/superdev/commit/c00b85aca8103f11174e501efe1ed0112254c3d0))

## [0.70.1](https://codeberg.org/bomret/superdev/compare/v0.70.0...v0.70.1) (2026-10-12)


### Bug Fixes

* **hooks:** Bash guards read backslash-escaped words, dash's (( subshells, and non-canonical run-state paths ([#1071](https://codeberg.org/bomret/superdev/issues/1071)) ([6fdeee6](https://codeberg.org/bomret/superdev/commit/6fdeee6f478ebb4ee0845a03241441e259ae2ec7))
* **scope:** rotate the trace with a closed ledger, refuse Stage-less input, record fail-to-pass start failures ([6527d8e](https://codeberg.org/bomret/superdev/commit/6527d8ea8b47db3dbfd926f95b28aeb5dbc6be68))
* **superdev-view:** every event-log line stays one row on the desktop side pane ([79b9957](https://codeberg.org/bomret/superdev/commit/79b99578e88d8243256d6d5d26820b2ae3ad0f9a))

# [0.70.0](https://codeberg.org/bomret/superdev/compare/v0.69.1...v0.70.0) (2026-10-11)


### Features

* **run-trace:** the run trace records every fact the scope view shows ([#1058](https://codeberg.org/bomret/superdev/issues/1058)) ([d3ad873](https://codeberg.org/bomret/superdev/commit/d3ad873b4e8679014ca9bdd17ae02fd68d03497f))

## [0.69.1](https://codeberg.org/bomret/superdev/compare/v0.69.0...v0.69.1) (2026-10-11)


### Bug Fixes

* **hooks:** Bash hooks read shell words with one balancing scanner ([#1050](https://codeberg.org/bomret/superdev/issues/1050)) ([305344c](https://codeberg.org/bomret/superdev/commit/305344cb93021a5af5e80f9ce1cd4bfbd8581432))

# [0.69.0](https://codeberg.org/bomret/superdev/compare/v0.68.0...v0.69.0) (2026-10-11)


### Features

* **implement:** a fail-to-pass run shows a change's tests discriminate ([5411a91](https://codeberg.org/bomret/superdev/commit/5411a91cedbb39e3f9f9bb8c4fd60d4eeff5c4ad))
* **plan:** every plan carries release-risk criteria ([#1002](https://codeberg.org/bomret/superdev/issues/1002)) ([ed2ad23](https://codeberg.org/bomret/superdev/commit/ed2ad23d502af31e988e188d5664685ecf738c63))
* **run-trace:** record each slice review's verdict in the run trace ([#1035](https://codeberg.org/bomret/superdev/issues/1035)) ([b955709](https://codeberg.org/bomret/superdev/commit/b955709f5c52151e4118f4bec341146f7632157b))


### Performance Improvements

* **implement:** faster full-tier slice loop ([#1043](https://codeberg.org/bomret/superdev/issues/1043)) ([382af86](https://codeberg.org/bomret/superdev/commit/382af86707cb8baaf26f920777f9029f521d1fb7))

# [0.68.0](https://codeberg.org/bomret/superdev/compare/v0.67.1...v0.68.0) (2026-10-09)


### Features

* **review:** flag vocabulary that drifts from the glossary ([f527383](https://codeberg.org/bomret/superdev/commit/f52738371d5a5db6ed8a1d2c2e45f3d84fd6b664))
* **ship:** offer to start verify-ship and wrap-up after the merge ([75859c6](https://codeberg.org/bomret/superdev/commit/75859c62cea063bcd5ca4240945638fe5fadf29a))

## [0.67.1](https://codeberg.org/bomret/superdev/compare/v0.67.0...v0.67.1) (2026-10-09)


### Bug Fixes

* **marketplace:** pin the plugin source to the release tag ([#977](https://codeberg.org/bomret/superdev/issues/977)) ([a0a1aa3](https://codeberg.org/bomret/superdev/commit/a0a1aa32a983f17aa9af8b89d7dbc544748a9be9))

# [0.67.0](https://codeberg.org/bomret/superdev/compare/v0.66.1...v0.67.0) (2026-10-09)


### Bug Fixes

* **prose:** plan and implement start setup and plan through the Skill tool ([#972](https://codeberg.org/bomret/superdev/issues/972)) ([98323dc](https://codeberg.org/bomret/superdev/commit/98323dcad184ce4121359b92c4a11bcc828c9a8b))
* **scope:** carry a green suite record across Markdown-only doc commits ([#969](https://codeberg.org/bomret/superdev/issues/969)) ([50f286b](https://codeberg.org/bomret/superdev/commit/50f286b32efdf3f3e7760b418f3160052574ebf2))
* **scope:** find ADR and invariant numbering collisions by number, not by conflict ([#966](https://codeberg.org/bomret/superdev/issues/966)) ([4f5bc26](https://codeberg.org/bomret/superdev/commit/4f5bc26bde4ca5a17f03813376f1a1ad116a7bc0))
* **tests:** the test run passes on a busy machine ([a880869](https://codeberg.org/bomret/superdev/commit/a8808690b0c416f7607789d993839b2c2ca298ab))


### Features

* **hooks:** the run trace records trustworthy evidence ([354801c](https://codeberg.org/bomret/superdev/commit/354801c321fb607a2ac3ca56961804ee4e1ce5f6))
* **plan:** repair a failed verification as its own fix feature ([#960](https://codeberg.org/bomret/superdev/issues/960)) ([1a0841b](https://codeberg.org/bomret/superdev/commit/1a0841bb55d8f604442c67660b2ab4d692fe5741)), closes [#932](https://codeberg.org/bomret/superdev/issues/932) [#935](https://codeberg.org/bomret/superdev/issues/935) [#933](https://codeberg.org/bomret/superdev/issues/933) [#956](https://codeberg.org/bomret/superdev/issues/956) [#956](https://codeberg.org/bomret/superdev/issues/956)

## [0.66.1](https://codeberg.org/bomret/superdev/compare/v0.66.0...v0.66.1) (2026-10-08)


### Bug Fixes

* **hooks:** close the 2026-10-05 sweep findings in the guardrails, docs, and tests ([fb91593](https://codeberg.org/bomret/superdev/commit/fb9159323eb6f9fe63492543bfa966835a6f17d1))

# [0.66.0](https://codeberg.org/bomret/superdev/compare/v0.65.0...v0.66.0) (2026-10-05)


### Features

* **implement:** bring the remote base into the scope branch before the first slice ([#889](https://codeberg.org/bomret/superdev/issues/889)) ([416b49a](https://codeberg.org/bomret/superdev/commit/416b49a458864fe74aa97f55e700a0ddca0dd220))

# [0.65.0](https://codeberg.org/bomret/superdev/compare/v0.64.0...v0.65.0) (2026-10-05)


### Features

* **review:** a run resolves a deferred finding it later fixes ([#891](https://codeberg.org/bomret/superdev/issues/891)) ([beb74cd](https://codeberg.org/bomret/superdev/commit/beb74cd7590af37d74a410eb7366443c7b7cebc4))

# [0.64.0](https://codeberg.org/bomret/superdev/compare/v0.63.0...v0.64.0) (2026-10-05)


### Bug Fixes

* **drift:** flag every body edit whose flag does not read a file, in fused spellings and fenced shell blocks ([96686cb](https://codeberg.org/bomret/superdev/commit/96686cbf667d79e56759d57f645a2fedf3f9bb2b))
* **prose:** mark a deliberate simplification with `simplicity:` ([2ccfe5d](https://codeberg.org/bomret/superdev/commit/2ccfe5d345de0ea1acbb18cf6eaa6a9c4cf10dc6))
* **staged-pages-at-close:** stage pages in the main working tree and name them at every close step ([#880](https://codeberg.org/bomret/superdev/issues/880)) ([8eb3a19](https://codeberg.org/bomret/superdev/commit/8eb3a19aef63e5d4309ca4cd5c4822b5e20a079e))


### Features

* **interview:** offer only vetted options, at most two per question ([#887](https://codeberg.org/bomret/superdev/issues/887)) ([159ce39](https://codeberg.org/bomret/superdev/commit/159ce3911bc8a94297b43b8a9f37c7371911db4b))
* **review:** run reviews and fixes on measured model tiers, and reconcile every sibling surface a fix touches ([75caf54](https://codeberg.org/bomret/superdev/commit/75caf54ba1d59bafd1f4e4fb7270a84335c05837))
* **run-trace:** a hook-written run trace backs the TDD order and the suite record ([#867](https://codeberg.org/bomret/superdev/issues/867)) ([de877ab](https://codeberg.org/bomret/superdev/commit/de877abf9c49353de054a363870ab0da187d7d52))
* **ship:** name wrap-up when nothing is left to verify ([549d7ec](https://codeberg.org/bomret/superdev/commit/549d7ec835fe2bb28b8386b71bc4026572c1208f))

# [0.63.0](https://codeberg.org/bomret/superdev/compare/v0.62.0...v0.63.0) (2026-10-05)


### Bug Fixes

* **anchor-body-write:** edit an anchor body only through one gated, file-based rule ([da28872](https://codeberg.org/bomret/superdev/commit/da28872b9a05ec03e046b96791ea7e5d9dacd017))
* **drift-selftest:** exercise every contract row and derive the test roster from tests/ ([425bdbf](https://codeberg.org/bomret/superdev/commit/425bdbf1513eb6a77aadbde23e13c388921c0e3a))
* **green-gate:** fail closed on a -C or --work-tree value naming an unexpanded shell variable ([0868ea0](https://codeberg.org/bomret/superdev/commit/0868ea033700f45de9e82657f3ad8b460469f900))
* **hooks:** block ledger writes behind an unbalanced substitution and read nested option values ([#841](https://codeberg.org/bomret/superdev/issues/841)) ([793a346](https://codeberg.org/bomret/superdev/commit/793a34638281959312f566632bb45f003e04e09c)), closes [#825](https://codeberg.org/bomret/superdev/issues/825) [#806](https://codeberg.org/bomret/superdev/issues/806) [#825](https://codeberg.org/bomret/superdev/issues/825) [#825](https://codeberg.org/bomret/superdev/issues/825) [#825](https://codeberg.org/bomret/superdev/issues/825) [#825](https://codeberg.org/bomret/superdev/issues/825)
* **hooks:** read an unquoted command substitution containing spaces as one shell word ([#825](https://codeberg.org/bomret/superdev/issues/825)) ([e46d28b](https://codeberg.org/bomret/superdev/commit/e46d28b1a114cf1e4a2a6947fba32c1343f095af)), closes [#806](https://codeberg.org/bomret/superdev/issues/806) [#806](https://codeberg.org/bomret/superdev/issues/806)
* **prose:** plan hands every scope to review, and setup names the per-language section's file ([94eeea3](https://codeberg.org/bomret/superdev/commit/94eeea3d8ed26cd087a46b3b997122415e1ef13c))
* **run-lock-test:** name the suite's temp root with mkdtemp so concurrent runs stop colliding ([8e695d9](https://codeberg.org/bomret/superdev/commit/8e695d9e736b4f777d31a01e5bdd0f9206a44fb0))


### Features

* **blind-slice-review:** the slice review settles its verdict before it reads the progress log ([d4d06b7](https://codeberg.org/bomret/superdev/commit/d4d06b780c3ceb5a333a7752142352a45921f5b8))
* **brainstorm:** write the intent as a draft while the interview runs ([8c591d7](https://codeberg.org/bomret/superdev/commit/8c591d70a18f2a92da63221845c567cfabb4ca67))
* **close-the-fix-loop:** fix every review finding, keep guard-rail remedies in the loop, derive criteria at plan time ([9e81c7f](https://codeberg.org/bomret/superdev/commit/9e81c7fe8995cf6b490a91523bdade528aae8833))
* **response-shapes:** end commands on a shared Next block and report brainstorm in a fixed shape ([ed1e666](https://codeberg.org/bomret/superdev/commit/ed1e666998ff60ec73eb080a3f5b3369a57d257a))

# [0.62.0](https://codeberg.org/bomret/superdev/compare/v0.61.0...v0.62.0) (2026-10-01)


### Features

* **remove-local-slice-store:** remove the local-file slice store ([cd13c9f](https://codeberg.org/bomret/superdev/commit/cd13c9fb033f5d04d2cc110538e87aeaccea70f2))

# [0.61.0](https://codeberg.org/bomret/superdev/compare/v0.60.0...v0.61.0) (2026-10-01)


### Features

* **forgejo-tea:** Forgejo backends reach the host through tea only ([9d99dab](https://codeberg.org/bomret/superdev/commit/9d99dab30bddc6cf5f1aa97dd530d8e415190362))
* **verify-and-wrap-up:** verify-ship and wrap-up close a shipped scope ([abb810b](https://codeberg.org/bomret/superdev/commit/abb810bb0f32aff2d845706015d3e4f66a4f6d83))

# [0.60.0](https://codeberg.org/bomret/superdev/compare/v0.59.0...v0.60.0) (2026-10-01)


### Bug Fixes

* **confluence-storage-body:** publish Confluence pages as formatted pages under their parent ([40dcb30](https://codeberg.org/bomret/superdev/commit/40dcb30a1b6a190a7786d078476c9d6f01426f4c))


### Features

* **affected-suites:** an affected full command and a whole-repo gate before the pull request ([d3c55bb](https://codeberg.org/bomret/superdev/commit/d3c55bb57fa63bd5bdf9f91b6f4bd1da538c2d2b))

# [0.59.0](https://codeberg.org/bomret/superdev/compare/v0.58.0...v0.59.0) (2026-09-30)


### Bug Fixes

* **kb-commands:** run the wiki backend commands through the tea CLI ([#782](https://codeberg.org/bomret/superdev/issues/782)) ([ad42ace](https://codeberg.org/bomret/superdev/commit/ad42acee88ce4be84a57f382be5eb2d1b000213f))


### Features

* **setup-seed-reconcile:** setup reconciles config documents with their seeds ([caf3cab](https://codeberg.org/bomret/superdev/commit/caf3cab46c4ff45ed4be0c5c73ac7f1844d1df87))

# [0.58.0](https://codeberg.org/bomret/superdev/compare/v0.57.0...v0.58.0) (2026-09-30)


### Features

* **remove-afk:** remove the afk command ([a16e985](https://codeberg.org/bomret/superdev/commit/a16e9859872d15fb476a9a1571363e1f4937f204))

# [0.57.0](https://codeberg.org/bomret/superdev/compare/v0.56.2...v0.57.0) (2026-09-30)


### Features

* **run-profile:** see where a scope run spent its time with /superdev:profile ([246f08d](https://codeberg.org/bomret/superdev/commit/246f08d1ac3c611e5f4cafdd5c29fa587a31f5a5))

## [0.56.2](https://codeberg.org/bomret/superdev/compare/v0.56.1...v0.56.2) (2026-09-29)


### Bug Fixes

* **ship-deploys-followups:** ship shows every deploy config it runs, and the deploy wording follow-ups ([490e25c](https://codeberg.org/bomret/superdev/commit/490e25cc91a1f8467c9ec3ae6975be71c4ba4d19))

## [0.56.1](https://codeberg.org/bomret/superdev/compare/v0.56.0...v0.56.1) (2026-09-29)


### Bug Fixes

* **citation-leading-underscore:** read a citation with an underscore in front ([8d03b46](https://codeberg.org/bomret/superdev/commit/8d03b465abdff2de19e2068f0d12afc6d58a14c1))
* **repo-move:** point the plugin and docs at bomret/superdev ([c96a400](https://codeberg.org/bomret/superdev/commit/c96a4002cf94381bc7b959c51492d021dec7deff))

# [0.56.0](https://codeberg.org/Zuhause/superdev/compare/v0.55.0...v0.56.0) (2026-09-28)


### Bug Fixes

* **invariant-check-underscores:** stop reading an underscore as a word ([68af9b0](https://codeberg.org/Zuhause/superdev/commit/68af9b0d4c0772faf830f18b65d23954c544eb74))
* **invariant-check:** read a glossary term that opens a list item ([#740](https://codeberg.org/Zuhause/superdev/issues/740)) ([6eb0cfa](https://codeberg.org/Zuhause/superdev/commit/6eb0cfa111d3f5212d95b73d4062f8a88929c5e7))


### Features

* **ship-deploys:** ship deploys the merged commit under the repository's deploy posture ([59e5761](https://codeberg.org/Zuhause/superdev/commit/59e5761ae50e4ee34d94cc24a0020c4d176d12b5))

# [0.55.0](https://codeberg.org/Zuhause/superdev/compare/v0.54.1...v0.55.0) (2026-09-28)


### Bug Fixes

* **bridge-kill-failure:** block a timed-out hook whose kill fails ([8116e66](https://codeberg.org/Zuhause/superdev/commit/8116e666a8e9abac45a838c1a44c92be72252ad6))


### Features

* **claude-code-only:** make superdev a Claude Code-only plugin ([a23783e](https://codeberg.org/Zuhause/superdev/commit/a23783e44bc77820aca265fa35db5580dc38fb99))
* **interview:** offer only live options, and fix a defect the plan finds ([#739](https://codeberg.org/Zuhause/superdev/issues/739)) ([b6b86a0](https://codeberg.org/Zuhause/superdev/commit/b6b86a067b4fbb7b7dc9f112b6ca05c3ccc3cf8b)), closes [#711](https://codeberg.org/Zuhause/superdev/issues/711) [#712](https://codeberg.org/Zuhause/superdev/issues/712) [#712](https://codeberg.org/Zuhause/superdev/issues/712) [#712](https://codeberg.org/Zuhause/superdev/issues/712) [#712](https://codeberg.org/Zuhause/superdev/issues/712) [#713](https://codeberg.org/Zuhause/superdev/issues/713) [#713](https://codeberg.org/Zuhause/superdev/issues/713) [#713](https://codeberg.org/Zuhause/superdev/issues/713) [#712](https://codeberg.org/Zuhause/superdev/issues/712) [#713](https://codeberg.org/Zuhause/superdev/issues/713) [#738](https://codeberg.org/Zuhause/superdev/issues/738) [#714](https://codeberg.org/Zuhause/superdev/issues/714) [#714](https://codeberg.org/Zuhause/superdev/issues/714) [#694](https://codeberg.org/Zuhause/superdev/issues/694) [#704](https://codeberg.org/Zuhause/superdev/issues/704) [#705](https://codeberg.org/Zuhause/superdev/issues/705)
* **invariant-citations:** resolve every INV citation outside the register ([bc343ed](https://codeberg.org/Zuhause/superdev/commit/bc343edfe51ce15d779fc0bd494aca8919057663))


### BREAKING CHANGES

* **claude-code-only:** superdev no longer renders for OpenCode or Codex. Users on those harnesses stay on v0.54.1.

## [0.54.1](https://codeberg.org/Zuhause/superdev/compare/v0.54.0...v0.54.1) (2026-09-28)


### Bug Fixes

* **bridge-spawn-failure:** answer every spawn failure, and retry a transient one once ([#708](https://codeberg.org/Zuhause/superdev/issues/708)) ([aa1fe0d](https://codeberg.org/Zuhause/superdev/commit/aa1fe0d3a271704244abb40f2f2686bb13ec1def)), closes [#681](https://codeberg.org/Zuhause/superdev/issues/681) [#681](https://codeberg.org/Zuhause/superdev/issues/681) [#688](https://codeberg.org/Zuhause/superdev/issues/688) [#706](https://codeberg.org/Zuhause/superdev/issues/706)

# [0.54.0](https://codeberg.org/Zuhause/superdev/compare/v0.53.1...v0.54.0) (2026-09-28)


### Features

* **ship:** merge the pull request with /superdev:ship, open it with /superdev:submit-pr ([#710](https://codeberg.org/Zuhause/superdev/issues/710)) ([e0e304d](https://codeberg.org/Zuhause/superdev/commit/e0e304d419628fbaa6b398c0455540c47ab871e3)), closes [#709](https://codeberg.org/Zuhause/superdev/issues/709)

## [0.53.1](https://codeberg.org/Zuhause/superdev/compare/v0.53.0...v0.53.1) (2026-09-26)


### Bug Fixes

* **repo-move:** point the plugin and docs at Zuhause/superdev ([#693](https://codeberg.org/Zuhause/superdev/issues/693)) ([04d371d](https://codeberg.org/Zuhause/superdev/commit/04d371d48028c923c51daf8a3cf1cf59250af008)), closes [#692](https://codeberg.org/Zuhause/superdev/issues/692)

# [0.53.0](https://codeberg.org/Zuhause/superdev/compare/v0.52.0...v0.53.0) (2026-09-26)


### Features

* **invariant-backfill:** backfill the invariant register and validate it ([#691](https://codeberg.org/Zuhause/superdev/issues/691)) ([cbb0cab](https://codeberg.org/Zuhause/superdev/commit/cbb0cabe778e808ff95158790a76857bb82249a4)), closes [#659](https://codeberg.org/Zuhause/superdev/issues/659) [#659](https://codeberg.org/Zuhause/superdev/issues/659) [#659](https://codeberg.org/Zuhause/superdev/issues/659) [#658](https://codeberg.org/Zuhause/superdev/issues/658) [#659](https://codeberg.org/Zuhause/superdev/issues/659) [#658](https://codeberg.org/Zuhause/superdev/issues/658) [#658](https://codeberg.org/Zuhause/superdev/issues/658) [#659](https://codeberg.org/Zuhause/superdev/issues/659) [#659](https://codeberg.org/Zuhause/superdev/issues/659) [#659](https://codeberg.org/Zuhause/superdev/issues/659) [#659](https://codeberg.org/Zuhause/superdev/issues/659) [#689](https://codeberg.org/Zuhause/superdev/issues/689)

# [0.52.0](https://codeberg.org/bomret/superdev/compare/v0.51.0...v0.52.0) (2026-09-25)


### Bug Fixes

* **document,afk:** hold the stage on a standing Unresolved entry (INV-0016) ([bcb60f6](https://codeberg.org/bomret/superdev/commit/bcb60f6304811ca2ef4d6f754e21364a2aa4bd95))
* **dod-line:** tick a checklist line with no tag segment ([5d63e43](https://codeberg.org/bomret/superdev/commit/5d63e432272476cb1e41b36c56895ea2c7241a38))
* **drift-check:** derive glossary citation coverage from heading references ([#639](https://codeberg.org/bomret/superdev/issues/639)) ([d672f1a](https://codeberg.org/bomret/superdev/commit/d672f1a9cdd4075084cee4cae75d376f9042211b)), closes [#637](https://codeberg.org/bomret/superdev/issues/637)
* **drift-check:** pin ADR 0095's accepted-verdict prohibition and decision point ([7ba889b](https://codeberg.org/bomret/superdev/commit/7ba889b6c0f800c70a33c11dcdb504b77ac0ab1f)), closes [#1](https://codeberg.org/bomret/superdev/issues/1) [#2](https://codeberg.org/bomret/superdev/issues/2)
* **drift-check:** pin the stdin-heredoc wording for add-denial/reset-denials ([d60e5ab](https://codeberg.org/bomret/superdev/commit/d60e5abaa2b2412326cf6aa876fe0658561bdff0))
* **knowledge-base-confluence:** add a read command template ([#677](https://codeberg.org/bomret/superdev/issues/677)) ([b255b36](https://codeberg.org/bomret/superdev/commit/b255b363cb1dbec4f16e6b924e5e4d976ceb9b86))
* **publish-kb:** refuse a patch on a non-markdown knowledge-base body format ([bb537ec](https://codeberg.org/bomret/superdev/commit/bb537ece3b9d522e66cf7dc3769f6789bb2bbbab))
* **scope-js:** pass Definition-of-Done text to dod-line without shell interpolation ([3558dbd](https://codeberg.org/bomret/superdev/commit/3558dbdeece262cae0a7ec2962ad357e767170c8)), closes [#680](https://codeberg.org/bomret/superdev/issues/680)
* **scope-js:** read degraded add-denial and reset-denials text from stdin ([a8a8c09](https://codeberg.org/bomret/superdev/commit/a8a8c095687b070648747a44104d49d9a815cb2a))


### Features

* **dod:** tick the Definition of Done while the run works ([#665](https://codeberg.org/bomret/superdev/issues/665)) ([d3dd7d4](https://codeberg.org/bomret/superdev/commit/d3dd7d4d87c5a9199149c0795623b80f0ea7a9d7)), closes [#647](https://codeberg.org/bomret/superdev/issues/647) [#649](https://codeberg.org/bomret/superdev/issues/649) [#650](https://codeberg.org/bomret/superdev/issues/650) [#650](https://codeberg.org/bomret/superdev/issues/650) [#649](https://codeberg.org/bomret/superdev/issues/649) [#648](https://codeberg.org/bomret/superdev/issues/648) [#651](https://codeberg.org/bomret/superdev/issues/651) [#651](https://codeberg.org/bomret/superdev/issues/651) [#651](https://codeberg.org/bomret/superdev/issues/651) [#653](https://codeberg.org/bomret/superdev/issues/653) [#653](https://codeberg.org/bomret/superdev/issues/653) [#653](https://codeberg.org/bomret/superdev/issues/653) [#653](https://codeberg.org/bomret/superdev/issues/653) [#652](https://codeberg.org/bomret/superdev/issues/652) [#652](https://codeberg.org/bomret/superdev/issues/652) [#647](https://codeberg.org/bomret/superdev/issues/647) [#648](https://codeberg.org/bomret/superdev/issues/648) [#649](https://codeberg.org/bomret/superdev/issues/649) [#650](https://codeberg.org/bomret/superdev/issues/650) [#651](https://codeberg.org/bomret/superdev/issues/651) [#653](https://codeberg.org/bomret/superdev/issues/653) [#652](https://codeberg.org/bomret/superdev/issues/652) [#660](https://codeberg.org/bomret/superdev/issues/660) [#655](https://codeberg.org/bomret/superdev/issues/655) [#656](https://codeberg.org/bomret/superdev/issues/656) [#660](https://codeberg.org/bomret/superdev/issues/660) [#661](https://codeberg.org/bomret/superdev/issues/661) [#662](https://codeberg.org/bomret/superdev/issues/662) [#663](https://codeberg.org/bomret/superdev/issues/663) [#654](https://codeberg.org/bomret/superdev/issues/654)
* **scope-js:** add the accepted Definition-of-Done verdict and fix dod-line matching (triage [#679](https://codeberg.org/bomret/superdev/issues/679)) ([9b21e72](https://codeberg.org/bomret/superdev/commit/9b21e72f4df26c7a8089535a54108ae7b86022e7))

# [0.51.0](https://codeberg.org/bomret/superdev/compare/v0.50.2...v0.51.0) (2026-09-23)


### Bug Fixes

* **bridge:** a killed gate is not a passing gate, and a gate that never ran is neither ([#630](https://codeberg.org/bomret/superdev/issues/630)) ([7026c9f](https://codeberg.org/bomret/superdev/commit/7026c9f66144f0a4fbc7c2427a3173228b6390e6)), closes [#616](https://codeberg.org/bomret/superdev/issues/616) [#617](https://codeberg.org/bomret/superdev/issues/617) [#618](https://codeberg.org/bomret/superdev/issues/618) [#606](https://codeberg.org/bomret/superdev/issues/606) [#607](https://codeberg.org/bomret/superdev/issues/607) [#607](https://codeberg.org/bomret/superdev/issues/607)
* **drift-check:** pin the observation-capture reminder at every subagent dispatch ([#636](https://codeberg.org/bomret/superdev/issues/636)) ([820ee22](https://codeberg.org/bomret/superdev/commit/820ee222934594dcc482aa35170aed93ae7c5081)), closes [#635](https://codeberg.org/bomret/superdev/issues/635)
* **scope-mode:** a caller consults the run lock before it writes, not after ([#632](https://codeberg.org/bomret/superdev/issues/632)) ([025a6b1](https://codeberg.org/bomret/superdev/commit/025a6b1000c411406ece248850e38a0fd55af1f5)), closes [#621](https://codeberg.org/bomret/superdev/issues/621) [#510](https://codeberg.org/bomret/superdev/issues/510) [#510](https://codeberg.org/bomret/superdev/issues/510) [#620](https://codeberg.org/bomret/superdev/issues/620) [#623](https://codeberg.org/bomret/superdev/issues/623)


### Features

* **run-surfacings:** a run's surfacings get an owner ([#634](https://codeberg.org/bomret/superdev/issues/634)) ([4d0b0ac](https://codeberg.org/bomret/superdev/commit/4d0b0acc0988890be7f67bfda3b86c0548e58587)), closes [#600](https://codeberg.org/bomret/superdev/issues/600) [#603](https://codeberg.org/bomret/superdev/issues/603) [#601](https://codeberg.org/bomret/superdev/issues/601) [#605](https://codeberg.org/bomret/superdev/issues/605) [#602](https://codeberg.org/bomret/superdev/issues/602)

## [0.50.2](https://codeberg.org/bomret/superdev/compare/v0.50.1...v0.50.2) (2026-09-22)


### Bug Fixes

* **slicetree-sweep:** a slice cut from a moved-on scope branch is not worked ([f4fa2f7](https://codeberg.org/bomret/superdev/commit/f4fa2f7b405275dbc3417c163333f11325c4c380))

## [0.50.1](https://codeberg.org/bomret/superdev/compare/v0.50.0...v0.50.1) (2026-09-22)


### Bug Fixes

* **green-gate:** a spawn that was killed carries no verdict ([#608](https://codeberg.org/bomret/superdev/issues/608)) ([c6081e2](https://codeberg.org/bomret/superdev/commit/c6081e2d16bc8c4d944f77b70b707c8c5b5c0f2c)), closes [#591](https://codeberg.org/bomret/superdev/issues/591) [#591](https://codeberg.org/bomret/superdev/issues/591) [#594](https://codeberg.org/bomret/superdev/issues/594) [#595](https://codeberg.org/bomret/superdev/issues/595) [#596](https://codeberg.org/bomret/superdev/issues/596) [#597](https://codeberg.org/bomret/superdev/issues/597) [#606](https://codeberg.org/bomret/superdev/issues/606) [#590](https://codeberg.org/bomret/superdev/issues/590) [#592](https://codeberg.org/bomret/superdev/issues/592) [#598](https://codeberg.org/bomret/superdev/issues/598)

# [0.50.0](https://codeberg.org/bomret/superdev/compare/v0.49.1...v0.50.0) (2026-09-22)


### Bug Fixes

* **backlog:** the survey names the moment the store was read ([ab8c961](https://codeberg.org/bomret/superdev/commit/ab8c961ac1b90c12e494865556cdb90ee888cc96)), closes [#573](https://codeberg.org/bomret/superdev/issues/573)


### Features

* **adapter:** render superdev for the Codex CLI harness ([#590](https://codeberg.org/bomret/superdev/issues/590)) ([1bc564e](https://codeberg.org/bomret/superdev/commit/1bc564e26b4710c54a606e482edd052a0115393a)), closes [#430](https://codeberg.org/bomret/superdev/issues/430) [#431](https://codeberg.org/bomret/superdev/issues/431) [#432](https://codeberg.org/bomret/superdev/issues/432) [#433](https://codeberg.org/bomret/superdev/issues/433)
* **verification:** the verification ceiling, and the focused command as required configuration ([#592](https://codeberg.org/bomret/superdev/issues/592)) ([edf20ed](https://codeberg.org/bomret/superdev/commit/edf20edda3cce20909cd52de9bc14427e37b7c23)), closes [#584](https://codeberg.org/bomret/superdev/issues/584) [#585](https://codeberg.org/bomret/superdev/issues/585) [#586](https://codeberg.org/bomret/superdev/issues/586) [#583](https://codeberg.org/bomret/superdev/issues/583) [#588](https://codeberg.org/bomret/superdev/issues/588) [#589](https://codeberg.org/bomret/superdev/issues/589)

## [0.49.1](https://codeberg.org/bomret/superdev/compare/v0.49.0...v0.49.1) (2026-09-21)


### Bug Fixes

* **plan:** a shipped scope takes no append ([#579](https://codeberg.org/bomret/superdev/issues/579)) ([7a94c36](https://codeberg.org/bomret/superdev/commit/7a94c36956995a27afe210b4f9f08857d8d0a2bf)), closes [#10](https://codeberg.org/bomret/superdev/issues/10) [#570](https://codeberg.org/bomret/superdev/issues/570) [#571](https://codeberg.org/bomret/superdev/issues/571) [#569](https://codeberg.org/bomret/superdev/issues/569) [#574](https://codeberg.org/bomret/superdev/issues/574)

# [0.49.0](https://codeberg.org/bomret/superdev/compare/v0.48.2...v0.49.0) (2026-09-21)


### Features

* **plan:** load-bearing commitments reach the invariant register ([#572](https://codeberg.org/bomret/superdev/issues/572)) ([1f2c6ab](https://codeberg.org/bomret/superdev/commit/1f2c6ab49c79d96907a1276f5982f1e4b6763f39)), closes [#556](https://codeberg.org/bomret/superdev/issues/556) [#557](https://codeberg.org/bomret/superdev/issues/557)

## [0.48.2](https://codeberg.org/bomret/superdev/compare/v0.48.1...v0.48.2) (2026-09-21)


### Bug Fixes

* **scope:** containment answers a conflicting merge-tree from base's history ([#563](https://codeberg.org/bomret/superdev/issues/563)) ([9737b19](https://codeberg.org/bomret/superdev/commit/9737b193845353eab234f327f2e8f383a6380cc3)), closes [#560](https://codeberg.org/bomret/superdev/issues/560) [#561](https://codeberg.org/bomret/superdev/issues/561) [#561](https://codeberg.org/bomret/superdev/issues/561) [#562](https://codeberg.org/bomret/superdev/issues/562)

## [0.48.1](https://codeberg.org/bomret/superdev/compare/v0.48.0...v0.48.1) (2026-09-21)


### Bug Fixes

* **plan:** a planned ledger hands the scope branch from plan to implement ([#558](https://codeberg.org/bomret/superdev/issues/558)) ([aefc2bc](https://codeberg.org/bomret/superdev/commit/aefc2bcefe42522a1024561d8036e4acbab95636)), closes [#417](https://codeberg.org/bomret/superdev/issues/417) [#510](https://codeberg.org/bomret/superdev/issues/510) [#509](https://codeberg.org/bomret/superdev/issues/509) [#554](https://codeberg.org/bomret/superdev/issues/554) [#549](https://codeberg.org/bomret/superdev/issues/549) [#550](https://codeberg.org/bomret/superdev/issues/550) [#551](https://codeberg.org/bomret/superdev/issues/551) [#553](https://codeberg.org/bomret/superdev/issues/553) [#552](https://codeberg.org/bomret/superdev/issues/552)

# [0.48.0](https://codeberg.org/bomret/superdev/compare/v0.47.0...v0.48.0) (2026-09-20)


### Bug Fixes

* **scope-mode:** one cascade resolves an empty argument ([#547](https://codeberg.org/bomret/superdev/issues/547)) ([f0f71e0](https://codeberg.org/bomret/superdev/commit/f0f71e0edc13c29bf1e8bb2480e6d37e062d7ac6)), closes [#544](https://codeberg.org/bomret/superdev/issues/544) [#546](https://codeberg.org/bomret/superdev/issues/546)


### Features

* **invariant-register:** invariants live in one central register ([#542](https://codeberg.org/bomret/superdev/issues/542)) ([9b6e7b5](https://codeberg.org/bomret/superdev/commit/9b6e7b51fa7e62a2ae409b2da6724297fe87985b)), closes [#537](https://codeberg.org/bomret/superdev/issues/537) [#538](https://codeberg.org/bomret/superdev/issues/538) [#539](https://codeberg.org/bomret/superdev/issues/539) [#536](https://codeberg.org/bomret/superdev/issues/536) [#535](https://codeberg.org/bomret/superdev/issues/535)

# [0.47.0](https://codeberg.org/bomret/superdev/compare/v0.46.0...v0.47.0) (2026-09-18)


### Bug Fixes

* **publish-kb:** bound every backend command with a timeout ([#534](https://codeberg.org/bomret/superdev/issues/534)) ([f9d78e9](https://codeberg.org/bomret/superdev/commit/f9d78e9c0f01dca5711d7218b728a15dbb755f2d)), closes [#530](https://codeberg.org/bomret/superdev/issues/530) [#531](https://codeberg.org/bomret/superdev/issues/531)
* **test-selection:** the in-loop test command is the cheap one ([#532](https://codeberg.org/bomret/superdev/issues/532)) ([5088447](https://codeberg.org/bomret/superdev/commit/508844726a036290439cedbc03385fe12d4bfe85)), closes [#517](https://codeberg.org/bomret/superdev/issues/517) [#516](https://codeberg.org/bomret/superdev/issues/516) [#517](https://codeberg.org/bomret/superdev/issues/517) [#515](https://codeberg.org/bomret/superdev/issues/515) [#521](https://codeberg.org/bomret/superdev/issues/521)


### Features

* **operator-identity:** move the slice-store assignee to untracked .superdev/info.json ([#528](https://codeberg.org/bomret/superdev/issues/528)) ([99a34e9](https://codeberg.org/bomret/superdev/commit/99a34e9b81c8dca359f2651a9554cef202e928fe)), closes [#514](https://codeberg.org/bomret/superdev/issues/514) [#513](https://codeberg.org/bomret/superdev/issues/513)

# [0.46.0](https://codeberg.org/bomret/superdev/compare/v0.45.0...v0.46.0) (2026-09-18)


### Features

* **publish-kb:** publish through a five-verb backend command contract ([#522](https://codeberg.org/bomret/superdev/issues/522)) ([22a63a3](https://codeberg.org/bomret/superdev/commit/22a63a3d00577909cd2e7dcd1e2e4d1bcccff9a3)), closes [#494](https://codeberg.org/bomret/superdev/issues/494) [#495](https://codeberg.org/bomret/superdev/issues/495) [#492](https://codeberg.org/bomret/superdev/issues/492) [#491](https://codeberg.org/bomret/superdev/issues/491) [#497](https://codeberg.org/bomret/superdev/issues/497) [#496](https://codeberg.org/bomret/superdev/issues/496) [#493](https://codeberg.org/bomret/superdev/issues/493) [#511](https://codeberg.org/bomret/superdev/issues/511) [#519](https://codeberg.org/bomret/superdev/issues/519)
* **sweep:** one read-only sweep over code, docs, tests, and config ([#520](https://codeberg.org/bomret/superdev/issues/520)) ([a815f21](https://codeberg.org/bomret/superdev/commit/a815f21dc06a301eacdae4fe8c19df6787a8ff74)), closes [#483](https://codeberg.org/bomret/superdev/issues/483) [#485](https://codeberg.org/bomret/superdev/issues/485) [#481](https://codeberg.org/bomret/superdev/issues/481) [#484](https://codeberg.org/bomret/superdev/issues/484) [#482](https://codeberg.org/bomret/superdev/issues/482)

# [0.45.0](https://codeberg.org/bomret/superdev/compare/v0.44.0...v0.45.0) (2026-09-17)


### Bug Fixes

* **eval:** the grader-shape gate tracks what the eval runner grades ([#490](https://codeberg.org/bomret/superdev/issues/490)) ([2dc7a05](https://codeberg.org/bomret/superdev/commit/2dc7a05a25eab70bb93da5445978c15d9c838d59)), closes [#477](https://codeberg.org/bomret/superdev/issues/477) [#476](https://codeberg.org/bomret/superdev/issues/476) [#479](https://codeberg.org/bomret/superdev/issues/479)
* **hooks:** reap the scope branch with its run root ([#478](https://codeberg.org/bomret/superdev/issues/478)) ([#502](https://codeberg.org/bomret/superdev/issues/502)) ([fb67372](https://codeberg.org/bomret/superdev/commit/fb673724deb6790b15f0e9d976d894a64302a859))
* **scope-mode:** refetch the base before answering not contained ([#487](https://codeberg.org/bomret/superdev/issues/487)) ([9853e7a](https://codeberg.org/bomret/superdev/commit/9853e7ae63a18dc6fc0cf81603aa3b15b5b83580)), closes [#469](https://codeberg.org/bomret/superdev/issues/469)


### Features

* **review-tests:** a measured, whole-tree test audit ([#503](https://codeberg.org/bomret/superdev/issues/503)) ([1802a83](https://codeberg.org/bomret/superdev/commit/1802a83a6ac8b28bc6324bb8153d9aaa641d15e8)), closes [#473](https://codeberg.org/bomret/superdev/issues/473) [#474](https://codeberg.org/bomret/superdev/issues/474) [#472](https://codeberg.org/bomret/superdev/issues/472)
* **review:** test cost is a review lens, and review can read standing code ([#464](https://codeberg.org/bomret/superdev/issues/464)) ([6e67de7](https://codeberg.org/bomret/superdev/commit/6e67de761ce4540bfda78173333473a33b993d0e)), closes [#459](https://codeberg.org/bomret/superdev/issues/459) [#461](https://codeberg.org/bomret/superdev/issues/461) [#460](https://codeberg.org/bomret/superdev/issues/460) [#462](https://codeberg.org/bomret/superdev/issues/462) [#463](https://codeberg.org/bomret/superdev/issues/463) [#458](https://codeberg.org/bomret/superdev/issues/458) [#459](https://codeberg.org/bomret/superdev/issues/459) [#460](https://codeberg.org/bomret/superdev/issues/460) [#461](https://codeberg.org/bomret/superdev/issues/461)

# [0.44.0](https://codeberg.org/bomret/superdev/compare/v0.43.0...v0.44.0) (2026-09-15)


### Features

* **plan:** require a Reachable: criterion in every Definition of Done ([#456](https://codeberg.org/bomret/superdev/issues/456)) ([c4a6246](https://codeberg.org/bomret/superdev/commit/c4a624658b394c7c3496a90f1d890f7228c6651f)), closes [#455](https://codeberg.org/bomret/superdev/issues/455) [#454](https://codeberg.org/bomret/superdev/issues/454) [#453](https://codeberg.org/bomret/superdev/issues/453)
* **prose-check:** apply controlled-prose to one piece of prose on demand ([#452](https://codeberg.org/bomret/superdev/issues/452)) ([c7182b3](https://codeberg.org/bomret/superdev/commit/c7182b35d99890824288e1613861292db7e21905)), closes [#435](https://codeberg.org/bomret/superdev/issues/435)

# [0.43.0](https://codeberg.org/bomret/superdev/compare/v0.42.0...v0.43.0) (2026-09-13)


### Bug Fixes

* **adapter:** restore OpenCode's own .env read guard on every rendered agent ([#420](https://codeberg.org/bomret/superdev/issues/420)) ([9c5b431](https://codeberg.org/bomret/superdev/commit/9c5b431f4af8d4cf36f676debce37f077e89fcf8)), closes [#419](https://codeberg.org/bomret/superdev/issues/419)
* **drift-check:** report a thrown scanner as that check's own gap ([#450](https://codeberg.org/bomret/superdev/issues/450)) ([ded25d4](https://codeberg.org/bomret/superdev/commit/ded25d44ec7d045932d179fa36c1910e564119bf)), closes [#434](https://codeberg.org/bomret/superdev/issues/434)
* **scope:** decide that a scope branch reached base by containment, not ancestry ([#418](https://codeberg.org/bomret/superdev/issues/418)) ([9c5a2ac](https://codeberg.org/bomret/superdev/commit/9c5a2acdd794f12f4f033452146629e35935f664)), closes [#417](https://codeberg.org/bomret/superdev/issues/417)


### Features

* **adapter:** render OpenCode prompts as skills, and afk as a command ([#428](https://codeberg.org/bomret/superdev/issues/428)) ([6075623](https://codeberg.org/bomret/superdev/commit/6075623263bbbfb0e345f640a1b36cfb93ae0089)), closes [#422](https://codeberg.org/bomret/superdev/issues/422) [#423](https://codeberg.org/bomret/superdev/issues/423) [#424](https://codeberg.org/bomret/superdev/issues/424) [#425](https://codeberg.org/bomret/superdev/issues/425) [#426](https://codeberg.org/bomret/superdev/issues/426) [#427](https://codeberg.org/bomret/superdev/issues/427)
* **scope:** guard the base-branch design-docs commit with a base lock ([#448](https://codeberg.org/bomret/superdev/issues/448)) ([b8fef2f](https://codeberg.org/bomret/superdev/commit/b8fef2fb07ae6f5c830e9fddbeec27153c06e65f)), closes [#436](https://codeberg.org/bomret/superdev/issues/436)

# [0.42.0](https://codeberg.org/bomret/superdev/compare/v0.41.0...v0.42.0) (2026-09-06)


### Bug Fixes

* **drift:** require a store's triage-record section to state its own exclusion rule ([#410](https://codeberg.org/bomret/superdev/issues/410)) ([aab46cf](https://codeberg.org/bomret/superdev/commit/aab46cfd08b44739c723c853cc3624e4f3f0984f)), closes [#409](https://codeberg.org/bomret/superdev/issues/409)


### Features

* **adapter:** give OpenCode a real, native upgrade command ([#412](https://codeberg.org/bomret/superdev/issues/412)) ([2ea2849](https://codeberg.org/bomret/superdev/commit/2ea2849824a2c9105f3c4f7b2d39759b8b325b67)), closes [#411](https://codeberg.org/bomret/superdev/issues/411)
* **adapter:** prompt interactively for missing OpenCode model-map aliases ([#406](https://codeberg.org/bomret/superdev/issues/406)) ([98ca7fe](https://codeberg.org/bomret/superdev/commit/98ca7feb7e424dc159e6f90aa63a5304359dc160)), closes [#382](https://codeberg.org/bomret/superdev/issues/382) [#385](https://codeberg.org/bomret/superdev/issues/385) [#383](https://codeberg.org/bomret/superdev/issues/383) [#384](https://codeberg.org/bomret/superdev/issues/384) [#381](https://codeberg.org/bomret/superdev/issues/381)


### Performance Improvements

* **review:** cut redundant review cost ([#404](https://codeberg.org/bomret/superdev/issues/404)) ([4724230](https://codeberg.org/bomret/superdev/commit/4724230f2ab663c82c6e09b7d15db56c2ae9ba96)), closes [#302](https://codeberg.org/bomret/superdev/issues/302) [#303](https://codeberg.org/bomret/superdev/issues/303) [#301](https://codeberg.org/bomret/superdev/issues/301) [#402](https://codeberg.org/bomret/superdev/issues/402) [#403](https://codeberg.org/bomret/superdev/issues/403)

# [0.41.0](https://codeberg.org/bomret/superdev/compare/v0.40.1...v0.41.0) (2026-09-04)


### Features

* **backlog:** print the untriaged bucket ([#401](https://codeberg.org/bomret/superdev/issues/401)) ([070d992](https://codeberg.org/bomret/superdev/commit/070d9923bc0ee07286596b37deba7d80824aca26)), closes [#400](https://codeberg.org/bomret/superdev/issues/400) [#399](https://codeberg.org/bomret/superdev/issues/399)

## [0.40.1](https://codeberg.org/bomret/superdev/compare/v0.40.0...v0.40.1) (2026-09-03)


### Bug Fixes

* **drift:** assert the `## Assignee` section, not just the configuration bullet ([#390](https://codeberg.org/bomret/superdev/issues/390)) ([fb44189](https://codeberg.org/bomret/superdev/commit/fb441897ce28fee671394bf2651222f632bda950)), closes [#388](https://codeberg.org/bomret/superdev/issues/388) [#386](https://codeberg.org/bomret/superdev/issues/386)
* **drift:** pin the specialising family's membership and the store side of `## Run state` ([#387](https://codeberg.org/bomret/superdev/issues/387)) ([99f40a5](https://codeberg.org/bomret/superdev/commit/99f40a568b1f4b4b66774863a095181823db57ca)), closes [#362](https://codeberg.org/bomret/superdev/issues/362) [#366](https://codeberg.org/bomret/superdev/issues/366) [#367](https://codeberg.org/bomret/superdev/issues/367) [#386](https://codeberg.org/bomret/superdev/issues/386)
* **glossary:** cite plan-contract.md from the specialising entries ([#397](https://codeberg.org/bomret/superdev/issues/397)) ([44d9dca](https://codeberg.org/bomret/superdev/commit/44d9dcab5d882515f0a5a5d77056add4023a1aea)), closes [#395](https://codeberg.org/bomret/superdev/issues/395) [#396](https://codeberg.org/bomret/superdev/issues/396) [#395](https://codeberg.org/bomret/superdev/issues/395)
* **opencode:** skip the upgrade skill in the OpenCode render ([#394](https://codeberg.org/bomret/superdev/issues/394)) ([d694ffc](https://codeberg.org/bomret/superdev/commit/d694ffc1e22cc5cb391a19f3143450e5df7e0b15)), closes [#393](https://codeberg.org/bomret/superdev/issues/393) [#393](https://codeberg.org/bomret/superdev/issues/393)

# [0.40.0](https://codeberg.org/bomret/superdev/compare/v0.39.0...v0.40.0) (2026-08-30)


### Features

* **adapter:** carry superdev as skills-canonical prose with an OpenCode adapter ([#380](https://codeberg.org/bomret/superdev/issues/380)) ([1e4975f](https://codeberg.org/bomret/superdev/commit/1e4975fa806017f8563bc773a1c4646573152565)), closes [#374](https://codeberg.org/bomret/superdev/issues/374) [#375](https://codeberg.org/bomret/superdev/issues/375) [#376](https://codeberg.org/bomret/superdev/issues/376) [#377](https://codeberg.org/bomret/superdev/issues/377) [#378](https://codeberg.org/bomret/superdev/issues/378) [#379](https://codeberg.org/bomret/superdev/issues/379)

# [0.39.0](https://codeberg.org/bomret/superdev/compare/v0.38.0...v0.39.0) (2026-08-28)


### Features

* **backlog:** survey the slice store by the action each item needs ([#371](https://codeberg.org/bomret/superdev/issues/371)) ([a96f9d4](https://codeberg.org/bomret/superdev/commit/a96f9d4ab34c43156ad192efaa79cc5e67691fe6)), closes [#370](https://codeberg.org/bomret/superdev/issues/370)

# [0.38.0](https://codeberg.org/bomret/superdev/compare/v0.37.1...v0.38.0) (2026-08-27)


### Bug Fixes

* **drift:** complete the source-sections pin family ([#364](https://codeberg.org/bomret/superdev/issues/364)) ([5acdc58](https://codeberg.org/bomret/superdev/commit/5acdc58b48289f39934f0acc01a7ac85814f656c)), closes [#359](https://codeberg.org/bomret/superdev/issues/359) [#360](https://codeberg.org/bomret/superdev/issues/360) [#355](https://codeberg.org/bomret/superdev/issues/355) [#358](https://codeberg.org/bomret/superdev/issues/358) [#360](https://codeberg.org/bomret/superdev/issues/360) [#361](https://codeberg.org/bomret/superdev/issues/361) [#362](https://codeberg.org/bomret/superdev/issues/362) [#363](https://codeberg.org/bomret/superdev/issues/363) [#355](https://codeberg.org/bomret/superdev/issues/355)
* **green-gate:** fail closed where superdev cannot see what it is verifying ([#343](https://codeberg.org/bomret/superdev/issues/343)) ([c5283c6](https://codeberg.org/bomret/superdev/commit/c5283c6cf16831357bfaffec551e377f474bfe78)), closes [#341](https://codeberg.org/bomret/superdev/issues/341) [#339](https://codeberg.org/bomret/superdev/issues/339) [#340](https://codeberg.org/bomret/superdev/issues/340)
* **hooks:** the merge matchers see every option that names the tree ([#351](https://codeberg.org/bomret/superdev/issues/351)) ([c860b4a](https://codeberg.org/bomret/superdev/commit/c860b4abd5b6c5572f4ca310ca2ed14c7eb9a831)), closes [#347](https://codeberg.org/bomret/superdev/issues/347) [#346](https://codeberg.org/bomret/superdev/issues/346)
* **plan-contract:** give the triage record a generic contract ([#358](https://codeberg.org/bomret/superdev/issues/358)) ([abc4f8d](https://codeberg.org/bomret/superdev/commit/abc4f8dbe7c9d9567224aeabd4be4749bbb05ad3)), closes [#354](https://codeberg.org/bomret/superdev/issues/354) [#355](https://codeberg.org/bomret/superdev/issues/355) [#356](https://codeberg.org/bomret/superdev/issues/356) [#357](https://codeberg.org/bomret/superdev/issues/357)


### Features

* **review:** a deferred finding becomes a triage record in the slice store ([#353](https://codeberg.org/bomret/superdev/issues/353)) ([339225d](https://codeberg.org/bomret/superdev/commit/339225d8de8ee8494229fbf49c7da59fd30c1a19))
* **scope:** a denial reset returns the budget and keeps the record ([#342](https://codeberg.org/bomret/superdev/issues/342)) ([9b942b4](https://codeberg.org/bomret/superdev/commit/9b942b4c454865b7c4ffea2756fd57b248ba47e0)), closes [#329](https://codeberg.org/bomret/superdev/issues/329) [#330](https://codeberg.org/bomret/superdev/issues/330) [#328](https://codeberg.org/bomret/superdev/issues/328) [#329](https://codeberg.org/bomret/superdev/issues/329)

## [0.37.1](https://codeberg.org/bomret/superdev/compare/v0.37.0...v0.37.1) (2026-08-26)


### Bug Fixes

* **implement:** the full tier runs in a scope worktree ([#338](https://codeberg.org/bomret/superdev/issues/338)) ([68d182f](https://codeberg.org/bomret/superdev/commit/68d182fcb5c7480d9a9e3f4c24de848c721f4c65)), closes [#336](https://codeberg.org/bomret/superdev/issues/336) [#335](https://codeberg.org/bomret/superdev/issues/335) [#334](https://codeberg.org/bomret/superdev/issues/334) [#332](https://codeberg.org/bomret/superdev/issues/332)

# [0.37.0](https://codeberg.org/bomret/superdev/compare/v0.36.1...v0.37.0) (2026-08-26)


### Features

* **drift:** record and pin append’s anchor-dependency exception ([#337](https://codeberg.org/bomret/superdev/issues/337)) ([10114ec](https://codeberg.org/bomret/superdev/commit/10114ecdae18ab50d943f5dfcc8d9b1046e0c111)), closes [#326](https://codeberg.org/bomret/superdev/issues/326) [#327](https://codeberg.org/bomret/superdev/issues/327) [#325](https://codeberg.org/bomret/superdev/issues/325)

## [0.36.1](https://codeberg.org/bomret/superdev/compare/v0.36.0...v0.36.1) (2026-08-25)


### Bug Fixes

* **agents:** tighten agent briefs, guard tool-agnostic prose with a drift check ([#331](https://codeberg.org/bomret/superdev/issues/331)) ([b1501d7](https://codeberg.org/bomret/superdev/commit/b1501d77de159f1b736b2047e799edaf4408b498))

# [0.36.0](https://codeberg.org/bomret/superdev/compare/v0.35.0...v0.36.0) (2026-08-25)


### Features

* **afk:** defer an anchor whose blocker has not shipped ([#316](https://codeberg.org/bomret/superdev/issues/316)) ([0b4721e](https://codeberg.org/bomret/superdev/commit/0b4721ebdd423f6b874f13eda1665cdf7cb3f692)), closes [#310](https://codeberg.org/bomret/superdev/issues/310) [#310](https://codeberg.org/bomret/superdev/issues/310) [#311](https://codeberg.org/bomret/superdev/issues/311)
* **plan:** sketch the design before decomposing ([#304](https://codeberg.org/bomret/superdev/issues/304)) ([158b8b5](https://codeberg.org/bomret/superdev/commit/158b8b5261e87984baf7260d3bf2eb133ca05794)), closes [#298](https://codeberg.org/bomret/superdev/issues/298) [#299](https://codeberg.org/bomret/superdev/issues/299)
* **review:** bound the fix loop and pin the dispatch prose ([#291](https://codeberg.org/bomret/superdev/issues/291)) ([f5d9e0d](https://codeberg.org/bomret/superdev/commit/f5d9e0df46e613e12d0a8be109fdb1ac2cd0efb0)), closes [#288](https://codeberg.org/bomret/superdev/issues/288) [#289](https://codeberg.org/bomret/superdev/issues/289) [#288](https://codeberg.org/bomret/superdev/issues/288) [#290](https://codeberg.org/bomret/superdev/issues/290)
* **scope:** cap an unattended run at two denied verification dispatches ([#323](https://codeberg.org/bomret/superdev/issues/323)) ([8efd7c4](https://codeberg.org/bomret/superdev/commit/8efd7c4e37e4638fa6313ff25fe92cae19765a76)), closes [#315](https://codeberg.org/bomret/superdev/issues/315) [#314](https://codeberg.org/bomret/superdev/issues/314)
* **scope:** key the unattended block on authorship, not on denial ([#312](https://codeberg.org/bomret/superdev/issues/312)) ([93ec3bb](https://codeberg.org/bomret/superdev/commit/93ec3bb23362a05b32ff87b11763f420fc3604f4)), closes [#307](https://codeberg.org/bomret/superdev/issues/307) [#308](https://codeberg.org/bomret/superdev/issues/308) [#306](https://codeberg.org/bomret/superdev/issues/306)
* **scope:** mirror run state to the scope anchor ([#324](https://codeberg.org/bomret/superdev/issues/324)) ([1869091](https://codeberg.org/bomret/superdev/commit/186909157da42d683c49dae1f1b833f6fc47dd23)), closes [#322](https://codeberg.org/bomret/superdev/issues/322) [#319](https://codeberg.org/bomret/superdev/issues/319) [#318](https://codeberg.org/bomret/superdev/issues/318) [#320](https://codeberg.org/bomret/superdev/issues/320) [#321](https://codeberg.org/bomret/superdev/issues/321) [#317](https://codeberg.org/bomret/superdev/issues/317)
* **scope:** record a deferred finding and pin every contract path ([#296](https://codeberg.org/bomret/superdev/issues/296)) ([f4d16d4](https://codeberg.org/bomret/superdev/commit/f4d16d47b69a80868970157fe6461985602e37fa)), closes [#293](https://codeberg.org/bomret/superdev/issues/293) [#294](https://codeberg.org/bomret/superdev/issues/294) [#286](https://codeberg.org/bomret/superdev/issues/286) [#291](https://codeberg.org/bomret/superdev/issues/291) [#293](https://codeberg.org/bomret/superdev/issues/293) [#294](https://codeberg.org/bomret/superdev/issues/294) [#295](https://codeberg.org/bomret/superdev/issues/295)
* **verification:** one full-suite verification gate per scope ([#286](https://codeberg.org/bomret/superdev/issues/286)) ([06886b0](https://codeberg.org/bomret/superdev/commit/06886b0b1e49818ee547f6996f7960f74180fe22)), closes [#283](https://codeberg.org/bomret/superdev/issues/283) [#284](https://codeberg.org/bomret/superdev/issues/284) [#283](https://codeberg.org/bomret/superdev/issues/283) [#284](https://codeberg.org/bomret/superdev/issues/284) [#285](https://codeberg.org/bomret/superdev/issues/285)

# [0.35.0](https://codeberg.org/bomret/superdev/compare/v0.34.1...v0.35.0) (2026-08-21)


### Bug Fixes

* **afk:** persist the consecutive-block count in .superdev/afk-blocks ([0861d4b](https://codeberg.org/bomret/superdev/commit/0861d4baa603f7be98d6ede8a744cf42601a7b69))
* **eval-run:** close two harness bugs, trim prompt context load, add the full-tier eval case ([b2855b4](https://codeberg.org/bomret/superdev/commit/b2855b40fa53c3085d0b3ba471095c8b53e2e506))


### Features

* **plan:** gate implementation on a human release of the plan ([#281](https://codeberg.org/bomret/superdev/issues/281)) ([9641fbc](https://codeberg.org/bomret/superdev/commit/9641fbc81f5fa1a5e2675ac131a9ece49058e82f))

## [0.34.1](https://codeberg.org/bomret/superdev/compare/v0.34.0...v0.34.1) (2026-08-20)


### Bug Fixes

* **docs:** close the 26 prose defects the markdown audit found ([#277](https://codeberg.org/bomret/superdev/issues/277)) ([8ff3aae](https://codeberg.org/bomret/superdev/commit/8ff3aae98788f10f34508256fc1b0e50c2401f97))

# [0.34.0](https://codeberg.org/bomret/superdev/compare/v0.33.0...v0.34.0) (2026-08-19)


### Bug Fixes

* **drift:** catch passive/gerund backend verbs; refactor: dedupe scanners, trim dead code ([39a908a](https://codeberg.org/bomret/superdev/commit/39a908a78cf4940677f3325aef71bfec014cbfc8))
* **hooks:** close the three verified guardrail bugs and pin their shared regex ([b9b66ab](https://codeberg.org/bomret/superdev/commit/b9b66ab9228c2d485e1cc154543afab8435e9e11))
* **scripts:** close the four CLI edge-case bugs and drop two dead surfaces ([813add8](https://codeberg.org/bomret/superdev/commit/813add8e9cd8b82fe85c59824b8f168e40e1dfc0))


### Features

* import the skills-main disciplines — diagnosis, expand–contract, reuse audit, and interview sharpenings ([e4791b1](https://codeberg.org/bomret/superdev/commit/e4791b1af766d73fdc7d763fe18883b69e892a58))

# [0.33.0](https://codeberg.org/bomret/superdev/compare/v0.32.1...v0.33.0) (2026-08-19)


### Bug Fixes

* anchor the shipped hooks to CommonJS and guard the marketplace source ([0d0c33d](https://codeberg.org/bomret/superdev/commit/0d0c33d1193c4591f242dfdd977e9180d6a5b9e6)), closes [issue-#32](https://codeberg.org/issue-/issues/32)
* **run-lock:** answer not-fresh on an unreadable lock instead of crashing ([9ce5f22](https://codeberg.org/bomret/superdev/commit/9ce5f22b3823988d0f5116110a1bb6b0be4bff2d))


### Features

* ship only the runtime plugin files ([72f12ac](https://codeberg.org/bomret/superdev/commit/72f12ac12372684d2e2164856798870fd434f697))

## [0.32.1](https://codeberg.org/bomret/superdev/compare/v0.32.0...v0.32.1) (2026-08-19)


### Bug Fixes

* **green-gate:** name the real Claude Code hook timeout default ([e0a490b](https://codeberg.org/bomret/superdev/commit/e0a490b01b5e8524650688c9eda1a0e63a05e575)), closes [#268](https://codeberg.org/bomret/superdev/issues/268)

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
