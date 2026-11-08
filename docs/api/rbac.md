# Permissions · Roles · User access (`rbac`)

> Di-generate dari kode oleh `bun run openapi:update` — jangan diedit manual (`bun run openapi:check` menolaknya).

[Kontrak API](README.md) › rbac

Endpoint modul ini dibagi per file route — satu halaman per bagian:

| Bagian | Endpoint |
|---|---|
| [me](rbac/me.md) | 1 |
| [permissions](rbac/permissions.md) | 7 |
| [roles](rbac/roles.md) | 11 |
| [user-access](rbac/user-access.md) | 8 |

| Endpoint | Ringkasan | Bagian |
|---|---|---|
| `GET /api/v1/me/permissions` | My permissions (API and menu keys) | [me](rbac/me.md) |
| `GET /api/v1/permissions` | List permissions with the endpoints they open (paginated, sortable, searchable) | [permissions](rbac/permissions.md) |
| `POST /api/v1/permissions` | Create a menu permission (key menu.…) | [permissions](rbac/permissions.md) |
| `GET /api/v1/permissions/options` | Every permission for a checklist, by group (not paginated) | [permissions](rbac/permissions.md) |
| `GET /api/v1/permissions/{id}` | Get a permission by id, with the endpoints it opens | [permissions](rbac/permissions.md) |
| `PATCH /api/v1/permissions/{id}` | Update a menu permission (label, group) | [permissions](rbac/permissions.md) |
| `DELETE /api/v1/permissions/{id}` | Delete a menu permission (soft delete; restorable) | [permissions](rbac/permissions.md) |
| `POST /api/v1/permissions/{id}/restore` | Restore a deleted menu permission | [permissions](rbac/permissions.md) |
| `GET /api/v1/roles` | List roles (paginated, sortable, searchable) | [roles](rbac/roles.md) |
| `POST /api/v1/roles` | Create a role | [roles](rbac/roles.md) |
| `GET /api/v1/roles/options` | Every role for the role checklist of a user, by key (not paginated) | [roles](rbac/roles.md) |
| `GET /api/v1/roles/{id}` | Get a role by id | [roles](rbac/roles.md) |
| `PATCH /api/v1/roles/{id}` | Update a role (name, description; super_admin cannot be changed) | [roles](rbac/roles.md) |
| `DELETE /api/v1/roles/{id}` | Delete a role (soft delete; system roles cannot be deleted) | [roles](rbac/roles.md) |
| `GET /api/v1/roles/{id}/permissions` | List the permissions of a role (super_admin: every permission) | [roles](rbac/roles.md) |
| `PUT /api/v1/roles/{id}/permissions` | Replace the permissions of a role (a checklist saved at once) | [roles](rbac/roles.md) |
| `PUT /api/v1/roles/{id}/permissions/{childId}` | Add a permission to a role (201 added, 200 already there) | [roles](rbac/roles.md) |
| `DELETE /api/v1/roles/{id}/permissions/{childId}` | Remove a permission from a role | [roles](rbac/roles.md) |
| `POST /api/v1/roles/{id}/restore` | Restore a deleted role (the caller must hold its permissions) | [roles](rbac/roles.md) |
| `GET /api/v1/users/{id}/permissions` | List the extra permissions of a user (expired ones included) | [user-access](rbac/user-access.md) |
| `PUT /api/v1/users/{id}/permissions` | Replace the extra permissions of a user (a checklist saved at once) | [user-access](rbac/user-access.md) |
| `PUT /api/v1/users/{id}/permissions/{childId}` | Grant an extra permission to a user, or change its expiry and note | [user-access](rbac/user-access.md) |
| `DELETE /api/v1/users/{id}/permissions/{childId}` | Revoke an extra permission from a user | [user-access](rbac/user-access.md) |
| `GET /api/v1/users/{id}/roles` | List the roles of a user | [user-access](rbac/user-access.md) |
| `PUT /api/v1/users/{id}/roles` | Replace the roles of a user (a checklist saved at once) | [user-access](rbac/user-access.md) |
| `PUT /api/v1/users/{id}/roles/{childId}` | Give a role to a user (201 given, 200 already held) | [user-access](rbac/user-access.md) |
| `DELETE /api/v1/users/{id}/roles/{childId}` | Revoke a role from a user | [user-access](rbac/user-access.md) |
