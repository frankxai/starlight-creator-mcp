# GitHub and npm release setup

Author: Codex. Created: 2 November 2026. Revision: 1.
Review state: proposed source changes; independent provider and maintainer review
remain required. These notes do not authorize a release or change account settings.

## Observed state

The authenticated GitHub API audit on 2 November 2026 found:

| Surface | Observed state |
| --- | --- |
| Source | Public `frankxai/starlight-creator-mcp`, default branch `main` |
| Main branch | Traditional branch protection absent; repository rulesets empty |
| Release environment | `npm-production`, owner reviewer, custom main-only branch policy |
| Self-review | Allowed in the environment; only the owner was listed as a collaborator |
| Community files | README and MIT license existed; contribution and issue/PR guides were absent |
| Release | Main-only manual OIDC workflow exists; actual npm trusted-publisher settings were not inspected |

This is an observation, not a permanent guarantee. Do not enable prevention of
self-review or require a second GitHub approval without arranging an independent
eligible reviewer: the observed single-owner setup can otherwise deadlock.
An agent's independent source review and the human environment approval serve
different purposes.

## Distribution decision

Keep the public JavaScript packages on the public npm registry. The npm scopes
identify package namespaces; they do not prove ownership of a similarly named
GitHub organization. Each package must identify its actual canonical GitHub
repository and monorepo directory. A mirror is not a repository transfer.

GitHub Packages is useful for deliberately private organization packages. Its npm
registry requires authentication even for public packages. Local use needs a
supported personal-access-token flow; GitHub Actions can use `GITHUB_TOKEN` with
the appropriate package access. Adding it as a public-install default introduces
an authentication requirement. Do not redirect these ten packages there or add a
global `.npmrc` scope mapping as part of an organization rename.

The default release path is one authoritative registry per artifact. Add GHCR
when a real deployable container is supported, rather than publishing a container
that nobody installs. Additional language registries need real consumer demand
and their own tested artifact, ownership and maintenance contract.

## Read-only candidate diagnostic

With authenticated `gh` and a clean checkout of the PR head:

```sh
pnpm run release:preflight --pr 12
```

The diagnostic reads GitHub settings, PR checks and local manifests. It makes no
API writes, provider calls, settings changes or package publication. Exit 1 means
blocked or incomplete automated evidence. Exit 2 means that those checks passed
but external gates still remain. `canPublish` is always false. A successful exit
code is deliberately not an authorization signal.

It requires all eight named CI jobs to succeed at the candidate head, including
Linux and Windows e2e. Skipped, pending and failed checks cannot satisfy that
condition. Ruleset-only protection is reported as unknown until its equivalent
enforcement is reviewed. Missing API permissions remain unknown. It does not
attest a check's GitHub App identity, registry ownership, an independent review,
live provider behavior or the integrity of unpublished archives.

## Configuration to review before enabling releases

1. Confirm canonical repository ownership against the estate registry. Transfer
   a repository only after reviewing workflows, environments, package links,
   permissions and npm publisher bindings. Preserve package names unless a
   deliberate consumer migration is approved.
2. Protect `main` with pull requests, strict required checks, stale-review
   dismissal, admin enforcement, resolved conversations and no force pushes or
   deletions. Bind checks to their actual GitHub App when configuring protection.
   Align required check names with the workflow before enabling them: the current
   CI ignores documentation-only changes, and requiring absent jobs would leave
   those PRs pending indefinitely. Stage an always-emitted acceptance gate or a
   reviewed path-filter change before turning that policy on.
3. Keep independent exact-revision review in the estate PR gate and arrange a
   human release approver. Requiring a GitHub approval count above zero also
   needs an eligible reviewer other than the PR author. Do not use a fabricated
   approval, administrator bypass or shared maintainer credential.
4. Keep `npm-production` restricted to `main` with human review. Review environment
   bypass permissions and the solo-owner self-review tradeoff explicitly.
5. On npm, inspect every package's actual trusted publisher: owner, repository,
   `.github/workflows/npm-release.yml`, environment `npm-production` and allowed
   actions must match this release path. The npm command runs under a supported
   Node/npm version. The source workflow currently selects Node 24 and npm
   11.10.0; a pnpm version is not an npm CLI version. Existing package existence
   or `npm whoami` does not prove the publisher is configured correctly.
6. Preserve account 2FA and recovery access. After OIDC acceptance is verified,
   review and remove obsolete publishing tokens through the human credential
   process. Do not create a token fallback or rotate credentials from this guide.

GitHub settings and credential operations require named human approval under the
estate contract. This branch prepares the evidence and proposed setup; it does
not change either.

## Production sequence

Review the exact candidate, resolve findings, run the non-draft acceptance jobs,
then merge through the estate PR gate. Check the resulting receiving-main SHA and
its own CI. A manual release selects that clean main revision. The release
workflow builds and scans the ten archives, records their exact identities and
hashes, and checks Linux and Windows consumers against the same Linux-built
archives before the human-approved environment can publish those bytes with OIDC.

Use the existing registry integrity preflight to distinguish an absent version
from an authentication or service error. If a version already exists with the
same integrity, preserve the receipt and continue the reviewed recovery path.
A conflicting existing version is a failure; npm versions are immutable. Do not
rebuild an already verified archive during publication.

After release, verify all ten public versions, dependency ranges, tarball
integrities and available attestations. Run clean public-registry installs on
Linux and Windows with credentials absent. Check CLI setup/doctor and MCP tool
discovery, retain source-bound receipts and then update the README's installation
status. A broken release needs a forward fix and an approved tag/deprecation
decision, rather than overwriting its version. Live provider recovery and cost
acceptance are separate evidence and must not be inferred from mocked CI.

## Sources

- [Existing release and consumer contract](NPM_RELEASE.md)
- [Repository CI](../.github/workflows/ci.yml) and [manual release workflow](../.github/workflows/npm-release.yml)
- [GitHub npm registry](https://docs.github.com/de/packages/working-with-a-github-packages-registry/working-with-the-npm-registry)
- [npm trusted publishers](https://docs.npmjs.com/trusted-publishers/)
- [GitHub branch protection API](https://docs.github.com/en/rest/branches/branch-protection)
- [GitHub repository rules API](https://docs.github.com/en/rest/repos/rules)
- [GitHub deployment environments API](https://docs.github.com/en/rest/deployments/environments)

Audit inputs: repository metadata, branch protection, rulesets, environments,
environment branch policies, collaborators and community profile endpoints.
Secrets were not retrieved. Live observations must be refreshed for the actual
release revision.
