# Core CRM Case-view compatibility fix

Core 1.9.04 supplied in server source b3ebfd9b-8faa-4797-b7d1-9eca45bc57a8 rejects savedQuery/userQuery, preventing ResourcePlanning CRM view refresh. The attached patch permits only a single valid view GUID on incidents and keeps view identity immutable during same-origin pagination. Six isolated transport tests passed. The trusted editable Core source was used to produce an official workbench submission targeting user-approved Core 1.9.7; ResourcePlanning remains 1.9.7. No live CRM or server installation was performed.

Release output: releases/ResourcePlanning-Core-1.9.7-CRMView-Fix-20261128/. Install through the official workbench compatibility and coordinated update flow; do not manually bypass the installed-state checks. Private runtime data are excluded.
