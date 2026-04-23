# Codex Mandatory Rules

These rules are mandatory for any Codex agent working on this repository.

1. For every major functional change, update `README.md` in the same work session.
2. After implementing and verifying changes, push the branch to GitHub.
3. After deployment-related changes, restart services on the target host (`boissons-backend.service`, and reload/restart nginx when relevant).
4. Never skip migration updates when schema changes are introduced.
5. Keep this file and `README.md` aligned when process rules change.
