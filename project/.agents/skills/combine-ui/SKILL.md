---
name: combine-ui
description: Modify existing Combine tools and build their pages with the approved Home and marketing-workbench design, shared icons and account shell. Use for Combine UI and scoped tool changes.
---

# Combine pages and tools

Resolve the supplied Combine checkout or portable development kit. A checkout has `platform/component-catalog.mjs`; a portable kit has `combine-kit.json`. Both provide `design-system/STANDARD.md`. Source received for a tool is kept in its separate workspace. Use the supplied project root and source paths.

Read root `AGENTS.md`, `PROJECT-MAP.md` when present, and `design-system/STANDARD.md`. The design is approved: use Dana, the shared colors, icons, header and menu style. Explicit user exceptions take precedence. Load only files relevant to the requested capability.

## Choose the scope

- **New page in an existing tool:** reuse its shell, identity and authorization. Add the content/route needed; do not create a second header or replace unrelated screens.
- **Existing tool change:** identify its business entry points, callers and data compatibility. Read `combine-source.json` when supplied and preserve its revision. Make the requested change within the editable inventory. Determine whether shared changes are needed yourself; the user only supplies business requirements. Downloads automatically include editable core/Home scope when permitted. Include necessary shared edits in the same submission and use `combine-release` to record each affected component's user-specified version. If authorization is insufficient, report the required grant and request a fresh download after it is given; reference files stay unchanged.
- **New tool:** use the sibling `combine-tool` skill for its template, CRM and backend contract, and read [integration.md](references/integration.md) for registration points.
- **Independent draft/template:** generate a working scaffold below. This does not register a tool or install anything.
- **Shared design change:** modify the canonical source once and assess consumers. Do not produce local variants of the settings icon or base CSS.

## Reusable scaffold

Run `scripts/scaffold.mjs` from this skill with `--project ROOT --id ID --title TITLE --output DIR`. Output must be a new directory inside project `outputs/` or `work/`. Optional `--config JSON_FILE` supplies navigation and description; see `assets/tool.config.json` for its schema by example.

The generated page works offline, includes local Dana, and builds navigation from configuration. `--icon SYMBOL` chooses a tool mark from `design-system/icons.svg`. `config.icon` supplies the same setting. Its `app.js` is the content hook. A single-section tool omits the unnecessary sidebar; multiple sections use the standard right sidebar and nested menus. This is a development scaffold; sample controls do not implement business operations.

`design-system/tokens.css`, `components.css` and `icons.svg` are canonical. `assets/shell.css` and `assets/shell.js` supply the reusable shell. Copies inside the isolated draft are for portability only. For real integration, serve shared assets once through the platform and reference them from tools. Core serves `platform/public/combine-ui` through `combine-ui-assets.mjs`; the server packager includes this directory explicitly. Other new public subdirectories still need an explicit package inventory entry.

Reuse shared account/logout/password modules. Populate identity and versions from authenticated APIs, never config literals or imported source-version labels. Hide unavailable actions. iframe and Shadow DOM require explicit style delivery; preserve hashed imported source and use adapters.

## Identity and shared services

Supply the tool mark for Home and its header from the same asset. Prefer an existing shared symbol when suitable. A new tool mark follows the canonical stroke, grid and color rules. Shared control icons retain their canonical symbols. Add required assets explicitly to the actual package inventory.

Use the shared organization-account connection when CRM is required. The current grant, reader and paging contracts are documented in `combine-tool/references/crm-integration.md`. Check authorization at the server boundary, and preserve the distinction between denied access, connection errors, partial results and empty data.

## Completion

Verify the requested flow, responsive layout, navigation, Escape/focus handling and fonts/icons. Check business access at the server boundary separately. For changes to existing behavior, check relevant callers and stored data. Update the relevant map only if an integration point changed. Report working behavior and remaining integration.

For a received source workspace, create the return using `combine-release/scripts/development-bundle.mjs submit` and follow `combine-tool/references/developer-workflow-fa.md`. Keep development submissions tied to their original revision. Actual packaging uses accepted merged source and the user-specified release version.
