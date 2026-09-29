# Apps Script synchronization core

`sync-core.gs` contains the replacements deployed in version 12 on 2026-09-29.
The Google project retains its existing credential, metadata helpers, subscription functions and `doGet` dispatcher. This file is not a standalone replacement for the full project.

Project: https://script.google.com/u/0/home/projects/1JRmgbMDIAyTBsVQs0aLydy9Zkww4oAvnmf64DgMokRWg4qx_l6MhE_Ay/edit

For updates, replace the matching function declarations in `Código.gs`; do not duplicate them. Keep credentials out of Git. Save, then edit the existing production deployment and select a new version, retaining its URL and access settings. Version 11 is the previous deployment version available for rollback.

Validation: `node --test tests/appsScript.test.js`. After deployment, an authenticated POST with an empty `registros` array returns `versaoSync: 2` without changing spreadsheet records. Verify a normal `pullBatch` as well. A successful deployment alone does not prove the upstream HTTP transport or payments have been confirmed.
