# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Build the project:
```bash
pnpm run build
# or with tsx for development
pnpm run dev
```

Test canary builds:
```bash
pnpm run canary
# or directly: scripts/canary.sh
```

**IMPORTANT**: This project uses pnpm exclusively. Always use pnpm commands, never npm. When making changes to this codebase:
- Use `pnpm install` to install dependencies
- Use `pnpm run build` to build 
- Use `pnpm run release` to publish new versions
- NEVER run `pnpm publish` directly - always use the `pnpm run release` script

**CRITICAL**: NEVER run `pnpm run release` or any publish commands unless the user explicitly says "release" or "publish". Always wait for explicit permission before releasing versions.

**RELEASE PROCESS**: When releasing, ONLY use `pnpm run release` - this script handles the entire process:
1. Builds and tests the project
2. Bumps the version and creates git tags
3. Pushes to GitHub
4. Publishes to npm with OTP authentication
5. Sets up the next canary version for development
NEVER manually run `pnpm publish`, `pnpm version`, or individual release steps - let the script handle everything.

**USER PREFERENCE**: The user prefers pnpm for all package management. When suggesting installation commands to users, always use pnpm (e.g., `pnpm install -g dev3000`) instead of npm.

The default server command in CLI is `pnpm dev` but can be overridden with `--server-command`.

## Architecture Overview

This is a TypeScript npm package that provides AI-powered development tools for Next.js projects. The architecture consists of:

**CLI Entry Point** (`src/cli.ts`):
- Uses Commander.js for CLI interface
- Single main command that auto-detects project type (Node.js/Python)
- Supports pnpm, yarn, npm for Node.js projects and auto-detects Python environments
- No separate setup command - runs development environment directly

**Core Components**:

1. **Development Environment** (`src/dev-environment.ts`):
   - Orchestrates any dev server + browser monitoring via Playwright
   - Works with any web framework (Next.js, Vite, etc.)
   - Checks port availability before starting (defaults: 3000 for app, 3684 for MCP server)
   - If ports are in use, displays process IDs and kill command instead of auto-killing
   - Uses persistent Chrome profile and captures unified logs
   - Monitors console logs, network requests, page errors, navigation events
   - Takes automatic screenshots on errors and route changes

2. **CDP Monitor** (`src/cdp-monitor.ts`):
   - Chrome DevTools Protocol monitoring implementation
   - Captures browser events, console logs, network requests, and errors
   - Handles screenshot capture on errors and navigation events
   - Manages WebSocket connections to Chrome debugging interface

3. **Log Parsing Services** (`src/services/`):
   - **Error Detectors**: Framework-specific error detection (Next.js, base patterns)
   - **Log Parsers**: Standard log parsing and output processing
   - **Output Processor**: Centralized log formatting and timestamp management

4. **MCP Server** (`mcp-server/`):
   - Standalone Next.js application providing MCP (Model Context Protocol) integration
   - Located at `mcp-server/app/api/mcp/[transport]/route.ts`
   - Provides `debug_my_app` tool for comprehensive debugging with multiple modes
   - Tools analyze development logs, detect errors, and provide fix recommendations

**MCP Integration**: The separate MCP server provides AI assistants with advanced debugging tools that analyze development logs in real-time, detect errors across multiple frameworks, and provide step-by-step fix guidance.

**Log Format**: Unified timestamps with source prefixes:
```
[2025-08-30T12:54:03.033Z] [SERVER] Ready on http://localhost:3000
[2025-08-30T12:54:03.435Z] [BROWSER] [CONSOLE LOG] App initialized
```

**Target Use Case**: Universal development tool that works with any web framework (Next.js, Vite, Python web apps, etc.). Auto-detects project type and package manager. Creates isolated browser profiles and consolidated logging to enable AI-assisted debugging and development workflow analysis.