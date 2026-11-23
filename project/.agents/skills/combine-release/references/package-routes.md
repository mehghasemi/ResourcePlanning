# Package routes

Paths are relative to combine. Read the selected implementation before execution; these capabilities do not prove today's complete product is covered.

| Route | Entry points | Boundary |
| --- | --- | --- |
| Fresh server | `platform/deployment/Build-Server-Package.ps1`, `Install.ps1`, `Host.ps1`, `package-check.mjs` | Includes Node, production dependencies, Caddy. Historical hard-coded tool/config lists and top-level public copying need auditing for active tools and new assets. |
| Generic component JSON | `platform/deployment/component-update.mjs`, `component-catalog.mjs`, `COMPONENT-UPDATES-FA.md` | Exact from-version, increasing target, core API/shared hashes, ownership, lease, local edits, journal and rollback. No data migration. |
| Workbench delta / new extension | `buildComponentDelta` in `component-update.mjs`, `development-engine.mjs`, `extension-registry.mjs` | Schema 2, explicit per-file base hashes, unchanged-file preservation, registered ownership or scoped extension manifest, serialized install and rollback. Runtime/dependency upgrades and data migration require their own deployment. |
| Baseline-compatible payload | Selected `scripts/package-<tool>-<release>.mjs`, paired installer/tests | Recent pricing/reports/workbench deliveries use payload/approved prior hashes/shared requirements. Follow the target's actual format. |
| Core only | `platform/deployment/server-update.mjs`, `Update-Server.cmd` | Core allowlist; unchanged non-core/runtime resources; only specific coordinated Home support. Not an all-tools installer. |
| Coordinated code release | `platform/deployment/release-update.mjs`, historical wrapper `scripts/upgrade-1.8.6.ps1` | Check/install/rollback/recover, target history and shared lease. Requires compatible package/history/index. |
| Source snapshot | `platform/deployment/Build-Version-Snapshot.ps1` | No overwrite; reviewed source. Audit inventory for new files. Snapshot alone is not installable. |

## After versions/baseline are established

Replace placeholder arguments with approved values/absolute paths. Create a new output parent first.

```powershell
node platform/deployment/component-update.mjs build --root APP_ROOT --component TOOL_ID --from SOURCE_VERSION --to TARGET_VERSION --output NEW_PACKAGE_JSON
powershell.exe -NoProfile -File STAGED_PLATFORM/deployment/Build-Server-Package.ps1 -OutputDirectory NEW_STAGING_OUTPUT -NodeExecutable VERIFIED_NODE_EXE
```

The server builder consumes staged metadata and downloads selected official runtimes. Do not silently upgrade dependencies. Preserve runtime versions/checksums/licenses.

## Important history

- `scripts/package-pricing-1.8.12.mjs` demonstrates payload packaging but hard-codes versions/paths, reads previous bundles and updates source versions. Similar package/finalize scripts can mutate archives. Inspect selected dependencies and adapt in new staging; never rerun blindly.
- `scripts/reports-package-compatibility.mjs` collects approved prior digests. Arbitrary current hashes must not become accepted baselines merely to bypass checks.
- `scripts/backup-for-upgrade.mjs` backs up settings/data under maintenance, refusing active process records. Its private output stays on the destination; never ship it in a distributable/snapshot.
- `component-installation.json` is runtime version/rollback state. Never ship the developer copy. `component-versions.json` is the reference; preserve unrelated component versions and align core/package metadata.

## Verification

Relevant existing checks include `platform/component-update.test.mjs`, `server-package.test.mjs`, `shared-release-upgrade.test.mjs` and the selected installer's `scripts/test-…mjs`. Ensure the test covers the delivered installer. Use disposable source/target fixtures with `.env.local`/data sentinels. Cover wrong baseline, altered payload/shared dependency and rollback/recovery where applicable. Hash the final archive after packaging.
