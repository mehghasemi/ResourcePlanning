# Integration map — real page/tool integration only

1. `platform/platform-access.mjs`: definition, allowed roles and safe defaults. Update role normalization/validation, not just the array. New tools default to no access. `requireTool` belongs at server routes too.
2. `platform/home.mjs`: account-filtered Home card/href; `public/home.mjs` has per-tool theme/icon maps. Unknown IDs do not automatically render safely.
3. `platform/<id>-http.mjs` and `server.mjs`: authenticated dispatch, page/assets, business endpoints and errors. `auth-http.mjs` has explicit protected-page rules. Check direct HTML/asset routes for bypasses. Use the caller's identity and actual feature grants.
4. `platform/component-catalog.mjs`: title and ownership for all tool files. Shared libraries/auth remain core. `component-status.mjs` reads installed version with reference fallback. Do not invent a version for scaffolding; ask only for actual packaging/release.
5. `public/logout.mjs`, `password-fields.mjs`, `organization-account-ui.mjs` and `organization-http.mjs`: reuse account behavior; avoid a second credentials UX when the approved organization account applies.
6. `*-source.json` and `*-release.mjs`: imported resource hashes and adapters. Preserve frozen source. Supply canonical styles explicitly to iframe/Shadow DOM, and omit duplicated embedded chrome.
7. `deployment/Build-Server-Package.ps1`: explicit tool/config inventories and top-level public files plus fonts. Registration alone does not make a tool packageable. Update the appropriate inventory and verify actual extracted coverage when packaging is requested.
8. For CRM tools, `platform/organization-account.mjs`: add the tool's organization grant, tied to its current role. Reuse `/api/account/organization` and the account UI. Read `combine-tool/references/crm-integration.md` for the actual reader, identity, paging and cache contracts.
9. Home's mark and the tool header use the same tool identity asset. Shared control icons use `design-system/icons.svg`. Verify icon mappings, asset authorization and actual package inclusion.

For a section inside an existing tool, use its current route/menu contract. Workbench-created extensions use `combine-tool/references/extension-development.md` when the target provides the extension loader. Existing first-party tools retain the explicit integration points above.
