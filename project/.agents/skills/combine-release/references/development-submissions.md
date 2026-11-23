# Development source and submissions

Use `scripts/development-bundle.mjs` for file handoff without Git. It uses only Node built-ins. Run it from a checkout or kit while pointing at the separate source workspace. CLI examples and the user workflow are in `combine-tool/references/developer-workflow-fa.md`.

## Export

Create a reviewed selection based on `assets/source-selection.example.json`. `files` contains explicit project-relative regular files with `editable` or `reference` access. `additionsUnder` lists the narrow tool-specific directories where new files may be added. Existing root-level file additions require a refreshed inventory or an appropriately scoped source layout. Avoid a platform-wide addition prefix for a tool-only task.

`sourceVersion` and `coreApi` describe the selected development source when known. The release baseline is separately obtained from the target. Include the needed backend, UI, shared references, instructions and tests in the selection. Source path validation excludes common runtime and credential locations. Review the actual inventory and file contents before distribution. For an immutable reference asset stored under a runtime-named directory, use a reviewed source location in the development workspace.

`export --project ROOT --selection SELECTION --output NEW_DIR` creates a full copy of the selection and `combine-source.json`. Export from a stable accepted source snapshot. Keep that original unchanged on the owner side. Give a copy to the developer. The manifest records schema `combine.source/1`, a revision UUID, component, source metadata, allowed addition prefixes and each file's access and SHA256.

## Submit

`submit --workspace EDITED_COPY --output NEW_DIR [--notes TEXT_FILE] [--deletions JSON_ARRAY] [--versions JSON_MAP]` compares the workspace to the received manifest. Reference-file edits and files outside the allowed addition paths are rejected. A missing baseline file requires an explicit editable deletion. Keep generated output outside the workspace. A workbench download includes the kit and its helpers in the workspace as reference files.

The output has `combine-submission.json` and `files/<source-relative-path>` for added and modified files. Deletions are explicit change entries with a null digest. The submission records the base revision, SHA256 of the complete original manifest, changes and notes. Each path occurs once, and case collisions are rejected.

For workbench delivery, GPT creates this output and returns a ZIP of the output directory. The user uploads that single ZIP. Put every intended deletion in its `combine-submission.json`; the workbench has no manual deletion field and does not accept deletion paths outside the archive. A missing file in a full-source ZIP is rejected rather than treated as a deletion.

For a shared-source download, `combine-source.json.shared` records the trusted core/Home scope and their source versions. `--versions` reads a JSON object such as `{"core":"USER_VERSION","home":"USER_VERSION"}` from outside the source workspace and embeds it in the submission. Ask the user for these numbers; do not infer/increment them. The workbench can ask for missing numbers before packaging. It derives affected owners from the actual merged files, validates current grants and source hashes again, builds a `combine.coordinated/1` transaction with separate component inventories, and updates reference/package/server metadata consistently. The component inventories are installed only through that coordinated transaction. Manual and failed-startup rollback restore the entire affected group. Other tools and private data are preserved. Ownership/recovery code is protected so that a partially applied shared change can still be recovered.

## Check

`check --baseline ORIGINAL_SOURCE --submission RETURN_DIR` uses the owner's preserved baseline. It validates the actual original files, source revision, original manifest hash, change permissions, payload hashes, deletions and exact payload inventory. Paths with traversal, alternate separators, Windows device names and symlinks/junctions are rejected.

The checker reads source and metadata. It does not import or execute submitted code. Keep test execution in an isolated environment with the explicitly needed fixture data and no production credentials.

After integrity checks, merge with the current accepted source using the preserved original as the third input. Resolve overlaps, review the combined behavior and rerun relevant checks. Concurrent acceptance must recheck the current revision under the acceptance lock. A stale submission cannot directly replace the current accepted tree. The running workbench performs these merge and acceptance operations for workbench uploads; the source owner handles them for manual handoffs.

Build the final installer from the accepted source snapshot. Bind it to the chosen source revision, user-specified version and supported installed baseline. Serialize install operations using the existing installer lease. The helper's successful check covers integrity and scope only.
