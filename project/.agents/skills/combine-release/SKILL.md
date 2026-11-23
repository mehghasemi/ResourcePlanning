---
name: combine-release
description: Prepare traceable Combine development submissions and versioned server or tool installers with compatibility checks, rollback and Persian installation guidance. Use for source handoffs and actual release packaging.
---

# Combine packages

Resolve the supplied Combine checkout or development kit. Read root `AGENTS.md` and `PROJECT-MAP.md` when present. A kit has `combine-kit.json`; a received source workspace has `combine-source.json`.

## Choose the deliverable

- **Development source or return:** read [development submissions](references/development-submissions.md). The supplied helper exports a reviewed inventory, records a source revision and checks changes against the original manifest. This needs no product release number.
- **Installable release:** use accepted merged code, the actual target baseline and [package-routes.md](references/package-routes.md). A development submission is the input to integration and review. Build the final installer after those changes have been accepted.

The portable kit supplies templates and helpers. An actual installer also needs the complete buildable source, the target's compatibility information and its supported packaging scripts. Report the available deliverable precisely when the environment lacks a required build dependency.

For a workbench return, GPT produces one ZIP of the helper's submission output, including `combine-submission.json`, changed files and every intended deletion. The user uploads the ZIP and chooses the version. The workbench validates and merges it against the current code, builds the final installer, and installs on request. Do not ask the user to enter deletion paths in the workbench UI.

Downloads automatically include permitted shared code; the user is not asked whether core/Home changes are needed. The developer or GPT determines that need from the requirement and source. When the trusted manifest has `shared: ["core", "home"]`, editable shared code can travel in that same ZIP. Obtain an explicit target version for every changed owner and pass a JSON map with `submit --versions PATH`. Preserve the user's exact version label, including leading zeros. The workbench derives affected owners from actual changes, builds `combine.coordinated/1` plus per-component inventories and installs/rolls back the group in one transaction. Unchanged owners keep their versions. Without this source scope and the current shared-development grant, core/Home edits are rejected. Recovery/ownership code, dependencies, private data and runtime metadata remain reference or excluded files; do not alter them to bypass a package check.

## Intake and scope

For an actual installer, replacement package or release, obtain the intended product/component version from the user unless already explicitly supplied. Never infer it from filenames, increment it, or mistake Node/Caddy/imported source versions for product versions. Creating/editing this skill, inspecting changes, or preparing a draft requires no version question.

Determine fresh installation versus upgrade, affected owners, and baseline versions. Use `scripts/inspect-changes.mjs --project ROOT [--component ID] [--baseline BASELINE_APP]` for a bounded read-only summary. With no baseline this is inventory, not a change claim. Local installation state does not establish the target server's state.

For a new tool, use the registration contract supported by the target. Workbench extensions use `combine.extension/1` and the schema 2 delta installer. Existing first-party tools use their explicit integration and ownership points. Record source revision separately from product/component versions.

Baseline comes from the intended server's manifest/status or verified release archive. If missing and material to compatibility, ask for that fact while continuing independent preparation. `git diff` is insufficient because substantial source is untracked. Do not inspect every archive: select the baseline and closest matching delivered package/installer.

## Build and verify

Choose full server, core-only, independent component or explicitly coordinated release by file ownership and dependencies. Shared authentication, server and UI libraries belong to core; do not hide them in a component package. Preserve unrelated files/versions. Core reference and `package.json` must agree. Never overwrite an existing release, especially `releases/v0.0.0`.

Use isolated staging. Version-specific scripts can hard-code versions, patch source metadata or mutate finalized archives: inspect and adapt before execution. Preserve the installer format proven for the selected baseline; generic JSON and compatibility-aware payload installers are not interchangeable.

Build from an explicit reviewed code inventory. Exclude runtime data, accounts, credentials, local env/settings, sessions, indexes, installation journals and backups. Reviewed immutable reference assets may be included; a folder named `data` does not authorize copying everything. Never weaken compatibility/hash/local-edit checks to force installation.

Verify hashes, archive contents, dependencies, version consistency and baseline compatibility. Exercise upgrade/rollback/recovery in a disposable fixture with meaningful data/settings sentinels. Component-only upgrades must preserve other components. Include referenced shared UI/fonts. Failed checks prevent a completed release claim.

Validate the final artifact after packaging. If a change transforms runtime data, provide and test the appropriate migration and recovery path with the supported installer. The generic component updater currently supports code updates with its fixed data schema.

## Deliver

Provide installable archive, trusted SHA256, source snapshot/manifest, concise change notes, supported source versions and Persian check/install/backup/rollback/recovery instructions. Distinguish fresh install from upgrade and required coordinated steps. State environment-specific limitations; fixture testing is not production validation.

Package preparation does not authorize stopping or installing on the actual server. Do not run the delivered installer against live installation unless requested. Complete authorized reversible preparation without repeated permission requests.
