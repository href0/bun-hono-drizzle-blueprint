# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for a security problem. Report it privately through GitHub: the repository's **Security** tab → **Report a vulnerability** (private vulnerability reporting). Include what is affected (file, endpoint or command), how to reproduce it, and the impact you expect.

You get an acknowledgement within a few days. A confirmed problem is fixed on `main` and noted in `CHANGELOG.md`; the advisory is published once a fix is available.

## Supported versions

Only the latest release and `main` receive fixes. A project created from this boilerplate takes a fix by porting it from the template (`upstream`), as described in `CHANGELOG.md`.

## Scope

In scope: the code of this repository — authentication and sessions, access control, the inbound channels (signed gateways, vendor webhooks), the data layer, configuration and the generated code templates. Out of scope: vulnerabilities in dependencies that are already reported upstream, and configurations the documentation advises against (for example running a server with `NODE_ENV=test`, or production without Redis — `docs/standards/cache.md` §6).
