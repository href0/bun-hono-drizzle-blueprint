---
name: env-protection
description: Security policy for environment files: never read, search or expose .env files other than .env.example. Use whenever a task touches configuration or environment variables.
---

# Environment File Protection Policy

The policy has one source: `.agents/AGENTS.md`, section "MANDATORY: Environment File Protection Policy". Read it now and follow it exactly — only `.env.example` may be read; abort before any tool call on another env file and answer with the message given there.

Configuration questions are answered from `.env.example` and `docs/standards/configuration.md`.
