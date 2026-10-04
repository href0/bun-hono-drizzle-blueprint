---
name: env-protection
description: Global security policy for reading environment files. MUST be read at the start of EVERY conversation or whenever reading/modifying configuration and environment files to prevent credential leaks.
---

# Environment File Protection Policy

This skill defines the mandatory security rules regarding the access and reading of environment (`.env`) files within this repository.

> [!IMPORTANT]
> **CRITICAL SECURITY RULE:**
> You are strictly PROHIBITED from reading, searching, or exposing any active or sensitive `.env` files (e.g., `.env`, `.env.production`, `.env.local`, `.env.development`, `.env.dev`, `.env.stg`, `.env.prod`) to prevent accidental leaks of credentials, API keys, and secrets.

## Allowed Files (Whitelist)
You are ONLY allowed to read or access the following environment file. Any other environment file (including .env, .env.local, .env.development, .env.test, .env.ci, .env.production, etc.) MUST be rejected.

- `.env.example`

## Strict Enforcement Steps

### 1. Check File Name Before Reading
Before executing any tool that reads file content (such as `view_file`, `grep_search`, `run_command` with `cat`/`type`, or custom tools) on any file starting with or containing `.env`, you MUST verify if the file is in the **Allowed Files (Whitelist)** list above.

### 2. Action on Violations
If a query, user request, or tool path points to a non-whitelisted `.env` file (e.g., `.env`, `.env.development`, `.env.production`, `.env.dev`, `.env.stg`, `.env.prod`):
1. **ABORT** the read operation immediately BEFORE invoking any tool call.
2. **NEVER generate a tool call** (such as `view_file`, `grep_search`, `run_command` with `cat`/`type`) that triggers a permission prompt or approval dialog to the user for protected `.env` files.
3. Do **NOT** use `view_file` or any shell/terminal commands to inspect it.
4. Inform the user directly in natural language:
   > "Error: Access to the requested environment file is blocked by the repository's Environment File Protection Policy (`env-protection` skill). Only whitelisted environment templates (e.g., `.env.example`) can be read."

### 3. Reporting Configuration Structure
If the user asks about configuration or environment variables, refer ONLY to `.env.example` to explain the required keys, structure, and default values. Never output actual secrets or values from non-whitelisted files.
