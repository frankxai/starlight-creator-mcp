# Contributing to Creator MCP

Maintained by the project maintainers. Initial guide: Codex, 2 November 2026,
revision 1; proposed in the release-readiness branch and awaiting maintainer review.

Help another creator complete a real task with their own machine and keys. Useful
contributions include a reproducible installation failure, provider-job recovery,
an accessible explanation, a tested provider adapter or an improvement to the
existing asset and provenance workflow. A small repair with a clear result is welcome.

## Before changing code

Read [README.md](README.md), [SECURITY.md](SECURITY.md) and the package you will
change. Check existing issues and pull requests before opening a new one. For a
large change, describe the user task, current alternative and proposed boundary in
an issue first. Maintainer agreement is needed before adding a new runtime,
provider dependency, credential flow or publication destination.

Use Node 22.13 or newer and the pinned pnpm 11.5.0. Install from the reviewed
source revision you intend to test. The README explains the published 0.1.0
installation problem; a successful source build does not prove that registry
version works.

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm run typecheck
pnpm run build
pnpm run lint
pnpm test -- --maxWorkers=1
pnpm run test:release
```

For release-script work, the dependency-free suite also runs with
`node --test scripts/test/*.test.mjs`. TypeScript/package changes need the build,
lint and relevant package tests. Package or dependency changes also need the
archive and installed-consumer checks in [NPM_RELEASE.md](docs/NPM_RELEASE.md).
Hosted CI checks the actual archives on Linux and Windows.

Use fixtures and mocked providers for tests. Do not add provider credentials,
contact live providers or incur charges in ordinary CI. A recovery test should
show that retrieving an existing job does not silently submit another paid job.
Treat model output and returned URLs as untrusted input, and retain the existing
network, storage and publication boundaries.

## A useful bug report or pull request

Give the exact source revision or installed package version, OS and Node version,
the smallest sanitized reproduction, expected result, actual result and relevant
test output. Distinguish a fixture, a source build, an installed archive and a
live-provider run. Share only data you are allowed to share. Remove tokens,
private prompts, personal data, account identifiers and private assets from logs.

Keep one user outcome per pull request, with tests that can fail for the reported
bug. Preserve the current package boundaries and public exports. Explain any
migration or unsupported case. Credit the actual human and agent contributors;
using an assistant is welcome, and the submitter remains responsible for the
change. Generated volume and a passing check do not replace review.

Contributions use the repository's existing MIT license. Do not include third-party
code, packs or media without compatible rights and attribution. No copyright
assignment or contributor agreement is introduced by this guide.

## Review and community

Discuss the work respectfully, explain disagreements with reproducible evidence
and accept that a maintainer may ask to reduce scope. Do not publish other people's
private information or harass contributors. Report security issues through
[SECURITY.md](SECURITY.md), rather than a public issue. For other conduct concerns,
use the private maintainer contact described there; do not include credentials.

Maintainer availability is limited; this guide makes no response-time or support
promise. A maintainer-confirmed issue with a small reproduction is a useful first
contribution. Public demos, contributor credits and testimonials require the
contributor's consent.

## Releases

Contributors prepare and verify changes. Maintainers review the exact revision,
and a human authorizes publication. Do not publish packages from a contributor
branch or add long-lived registry tokens as a workaround. See the
[GitHub release setup guide](docs/GITHUB-RELEASE-SETUP.md) for the observed setup,
remaining gates and read-only diagnostic.
