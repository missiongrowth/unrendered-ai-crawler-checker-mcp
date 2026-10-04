# Security policy

## Supported versions

Only the latest release is supported: the current Chrome Web Store version of the extension and the latest `unrendered-mcp` on npm.

## Reporting a vulnerability

Please do not open a public issue. Report it privately through [GitHub's private vulnerability reporting](https://github.com/imfurkana/unrendered/security/advisories/new), or email contact@missiongrowth.io with "Unrendered security" in the subject.

Include the version, the steps to reproduce and what an attacker gains. We reply within 5 working days and tell you when a fix ships.

## Scope

In scope: the extension in `src/` and the MCP server in `mcp/`, for example a web page that can trigger privileged requests through the extension, script injection into the side panel, or an MCP tool call that reads local files or runs commands.

Out of scope: what a site returns to the requests Unrendered makes, and findings that need a malicious extension or local access to the machine.
