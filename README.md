# OliveX Security - VSCode Extension

🛡️ Automated vulnerability fixing with 0xHunter and Claude Code integration.

## Features

- **Pull Vulnerabilities**: Fetch security bugs directly from 0xHunter platform
- **Tree View**: Organized view of bugs grouped by severity (Critical, High, Medium, Low)
- **Claude Code Integration**: Automatically fix vulnerabilities using AI-powered code analysis
- **Bug Details Panel**: Rich webview with complete bug information
- **Status Management**: Mark bugs as fixed directly from VSCode
- **Secure Credentials**: OAuth2 authentication with secure credential storage

## Getting Started

### 1. Install the Extension

Install from the VSCode marketplace or build from source:

```bash
npm install
npm run compile
```

### 2. Configure 0xHunter Credentials

1. Open Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
2. Run: `OliveX: Configure 0xHunter Credentials`
3. Enter your Client ID and Client Secret from 0xHunter

### 3. Pull Bugs

1. Click the sync icon in the OliveX sidebar
2. Or run: `OliveX: Pull Bugs from 0xHunter`

### 4. Fix Vulnerabilities with Claude Code

1. Select a bug in the tree view
2. Click the "Fix with Claude Code" button
3. Claude Code will analyze and propose fixes automatically

## Usage

### Commands

- `OliveX: Configure 0xHunter Credentials` - Set up API credentials
- `OliveX: Pull Bugs from 0xHunter` - Fetch latest vulnerabilities
- `OliveX: Fix Bug with Claude Code` - Auto-fix selected vulnerability
- `OliveX: View Bug Details` - Open detailed bug information panel
- `OliveX: Mark as Fixed` - Update bug status in 0xHunter
- `OliveX: Open in 0xHunter` - View bug in web browser

### Tree View

The OliveX sidebar shows bugs grouped by severity:

```
🔴 CRITICAL (2)
├─ SQL Injection in login endpoint
└─ Remote Code Execution in file upload

🟠 HIGH (5)
├─ XSS in dashboard
├─ Authentication bypass
└─ ...
```

### Claude Code Integration

When you click "Fix Bug", OliveX:

1. Creates a detailed context file in `.olivex/bug-{id}.md`
2. Includes all bug information (description, PoC, recommendations)
3. Launches Claude Code with the context
4. Claude Code analyzes the code and proposes secure fixes

### Bug Details Panel

Rich webview showing:
- Full vulnerability description
- Proof of Concept code
- Recommended fixes
- Affected files and lines
- CVSS score and CWE classification
- Quick action buttons

## Configuration

### Settings

- `olivex.apiBaseUrl`: 0xHunter API base URL (default: `https://api.0xhunter.io`)
- `olivex.autoRefresh`: Automatically refresh bugs on workspace open
- `olivex.refreshInterval`: Auto-refresh interval in seconds (default: 300)

### Credentials

Credentials are stored securely using VSCode's Secret Storage API.

## Requirements

- VSCode 1.80.0 or higher
- Claude Code CLI installed (`npm install -g @anthropic-ai/claude-code`)
- Active 0xHunter account with API credentials

## Architecture

```
olivex-vscode/
├── src/
│   ├── extension.ts          # Main extension entry point
│   ├── types.ts              # TypeScript type definitions
│   ├── api/
│   │   └── hunter-client.ts  # 0xHunter API client
│   ├── claude/
│   │   └── code-integration.ts # Claude Code bridge
│   ├── commands/
│   │   ├── configure.ts      # Credentials setup
│   │   ├── pullBugs.ts       # Fetch bugs
│   │   ├── fixBug.ts         # AI-powered fixing
│   │   ├── markFixed.ts      # Status updates
│   │   ├── viewBugDetail.ts  # Detail panel
│   │   └── openInBrowser.ts  # External links
│   ├── providers/
│   │   ├── bugTreeView.ts    # Sidebar tree view
│   │   └── bugDetailPanel.ts # Bug details webview
│   └── config/
│       └── settings.ts        # Configuration manager
```

## Development

### Build

```bash
npm install
npm run compile
```

### Watch Mode

```bash
npm run watch
```

### Debug

1. Open in VSCode
2. Press F5 to launch Extension Development Host
3. Test the extension in the new window

### Package

```bash
npm install -g vsce
vsce package
```

## API Integration

The extension communicates with 0xHunter API:

- **Authentication**: OAuth2 client credentials flow
- **Endpoints**:
  - `POST /api/v1/auth/token` - Get access token
  - `GET /api/v1/bugs` - List vulnerabilities
  - `GET /api/v1/bugs/:id` - Get bug details
  - `PATCH /api/v1/bugs/:id/status` - Update bug status

## Security

- Credentials stored using VSCode Secret Storage
- HTTPS-only API communication
- No sensitive data in logs or output
- OAuth2 token refresh handling

## Roadmap

- [ ] Support for custom severity filters
- [ ] Bulk bug actions
- [ ] Integration with other bug bounty platforms
- [ ] AI-powered vulnerability detection in workspace
- [ ] Automated security test generation
- [ ] Git commit integration for fixes
- [ ] Team collaboration features

## Contributing

Contributions are welcome! Please open an issue or PR.

## License

Proprietary - OliveX Security

## Support

- Email: support@olivex-security.com
- Website: https://0xhunter.io

---

**Made with ❤️ by OliveX Security**
