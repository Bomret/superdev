# Security policy

superdev runs hooks and shell commands on the machine of the person using it. A bug that lets a
command, a file, or a repository's content do more than superdev intends is a security bug.

## Report a vulnerability

Report it privately through GitHub: open
<https://github.com/Bomret/superdev/security/advisories/new>, or the repository's **Security** tab,
then **Report a vulnerability**. Do not open a public issue, pull request, or discussion for it.

Include:

- the superdev version (`plugin/.claude-plugin/plugin.json`) and your Claude Code version;
- the steps that reproduce it, or a proof of concept;
- what an attacker gains.

## What happens next

The maintainer answers within 7 days, agrees the fix and its timing with you, and credits you in the
advisory unless you ask otherwise.

## Supported versions

Only the latest release receives security fixes.
