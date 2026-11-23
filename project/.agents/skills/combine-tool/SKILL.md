---
name: combine-tool
description: Create and integrate a new Combine tool with shared identity, optional organization CRM, tool metadata and a transferable development template. Use for new tools and their platform integration.
---

# Combine tool development

Resolve the supplied project or extracted development kit. In a checkout, start with `AGENTS.md` and `PROJECT-MAP.md`. A portable kit has `combine-kit.json` and `DEVELOPMENT-GUIDE-FA.md`. Use the supplied source revision and shared references. Keep credentials and runtime data on their owning server.

## Start a tool

Capture the business flow, inputs, outputs and required operations. Choose a unique lowercase tool ID. A draft has no product version. Ask for the intended version when an actual installable release is requested.

Use [the tool contract](references/tool-contract.md) to define files, routes, permissions, dependencies and data changes. Generate an isolated starter with the sibling `combine-ui` scaffold and the backend templates:

```powershell
node .agents/skills/combine-tool/scripts/create-tool.mjs --project . --id example --title "ابزار نمونه" --output work/example
```

Add `--crm organization-read` when CRM reading is required. The default is `--crm none`. `--config` accepts the UI configuration documented in `combine-ui`. The result includes a working offline UI, tool metadata and backend integration templates. Follow its `START-FA.md` when connecting it to the real platform.

## Integrate

Use `combine-ui` for the approved shell, visual identity, icons and all existing-page changes. Read its `references/integration.md` for the current registration points. Read [CRM integration](references/crm-integration.md) when CRM is needed. Shared login, logout, account settings and server-side permissions remain authoritative. Register organization CRM grants for the new tool as part of integration.

When source is downloaded from the development workbench, follow [the extension contract](references/extension-development.md). Its `combine.extension/1` manifest is executable metadata for the installed loader. Legacy first-party tools use the integration points in `combine-ui/references/integration.md`. The standalone scaffold's `combine.tool-draft/1` manifest remains development metadata. Choose the contract supported by the actual target.

Use the current user's organization connection. A tool that writes CRM needs a separate, explicitly requested business operation, validated inputs and its own authorization and retry behavior. The read template supplies the existing read-only transport.

## Hand off

Check the requested business flow and permission boundaries. State whether code is a standalone preview, integrated source or a verified installer. Include the tool icon, requirements, changes, dependencies and any data migration/rollback procedure that the change needs.

For a team handoff, follow [the developer workflow](references/developer-workflow-fa.md). Preserve the received `combine-source.json` and create a development submission with `combine-release`. The accepted merged source is the input to the final installer build.

For a workbench template, the user supplies the downloaded template and their business requirements to GPT. Implement the tool, then use `combine-release` to return one uploadable ZIP containing `combine-submission.json` and the changed files. Record intended deletions in that manifest through the helper. The user uploads this ZIP and chooses the release version; Combine validates and merges the submission, builds the final installer and installs it when requested. Include this workflow and a ready-to-copy GPT prompt in the handoff guide.

Ordinary extension registration dynamically supplies routes, roles and Home cards. Determine necessary core/Home changes from the requirement and source yourself; do not ask the user to make that technical choice. A workbench download automatically includes shared editable source when the user's current grants allow it. Include necessary editable shared files in the same return, obtain explicit versions for the changed components, and give the helper `--versions JSON_PATH`. The workbench derives affected owners from actual changes and handles one atomic installation and group rollback. Preserve read-only metadata and recovery files. If a required file is read-only, report the missing authorization and request a new download after the administrator grants it. A tool-only manifest cannot authorize shared edits.
