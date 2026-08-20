---
type: llm
focus: files
weight: 2
---
The feature stated one authorisation rule: writes go through an API key in the
`X-Api-Key` header, and reads are public.

PASS only if the diff enforces exactly that split — create, update, and delete
reject a request whose API key is absent or wrong with an observable failure
response, while read by id and the paged list succeed with no key at all — and
at least one test asserts the rejection.

FAIL if the guard covers reads as well as writes, if it covers only some of
the three writes, if a wrong key is treated differently from an absent one
without the feature asking for that, or if the rejection is untested.
FAIL if the accepted key is compared against a value the diff hardcodes in the
request path with no way for the deployment to set it.

The header parsing style, the status code chosen, and where the check lives do
not matter.
