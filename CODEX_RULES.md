# Codex Mandatory Rules

These rules are mandatory for any Codex agent working on this repository.

1. Work from `/opt/boissons/Boissons_Magellan` and read `README.md` before making repository changes.
2. For every major functional change, update `README.md` in the same work session.
3. After implementing and verifying changes, push the branch to GitHub.
4. After deployment-related changes, restart services on the target host (`boissons-backend.service`, and reload/restart nginx when relevant).
5. Never skip migration updates when schema changes are introduced.
6. Keep this file and `README.md` aligned when process rules change.
