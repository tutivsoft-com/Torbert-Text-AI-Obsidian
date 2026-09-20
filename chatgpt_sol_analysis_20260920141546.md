# Torbert implementation analysis

## Reviewed code map

Reviewed `src/main.ts`, transformation workflows, `src/billing.ts`, settings/types, account/support modules, pending spend recovery, and publish output.

## Changes and safeguards

- Character charging is based on raw output/input accounting rather than an incorrect per-1,000 assumption.
- Free usage is account-scoped and paid spending uses authenticated Constance requests with stable retry IDs; transient failures block AI execution.
- Removed startup grant messaging and retained only action/result/error notices.
- Defaults allow a first transformation without optional prompt/model tuning; advanced prompts and provider settings remain later in settings.
- Primary transform/undo actions lead the command surface, with diagnostics and advanced controls progressively disclosed.

## Threat model and migration

Sessions are bearer-protected, passwords are never saved, and the server links the installation to the account. Authentication failures clear local session state. Pending spend records remain until the server gives an authoritative result.

## Documentation and logging

In-plugin help describes transformations, defaults, account/billing, privacy, troubleshooting, and undo/rollback. Diagnostics cover lifecycle, billing sync/spend, transformation failures, and cancellation without note text or secrets.

## Validation

Run `npm run typecheck`, `npm test`, `npm run build`, and `git diff --check`; mirror only validated publish files. No deployment, commit, or push is part of this task.

## Remaining limitation

Provider/network behavior remains dependent on configured external services.
