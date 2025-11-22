# OliveX VSCode Extension - Setup Guide

## Quick Start

### 1. Install Dependencies

```bash
cd /Users/gamba/Desktop/Hacking/olive/oliviaVscode
npm install
```

### 2. Compile TypeScript

```bash
npm run compile
```

### 3. Test in Development Mode

Press `F5` in VSCode to launch the Extension Development Host.

### 4. Configure 0xHunter Credentials

In the Extension Development Host:
1. Open Command Palette (`Cmd+Shift+P`)
2. Run: `OliveX: Configure 0xHunter Credentials`
3. Enter your credentials from 0xhunter.io

### 5. Pull Bugs

Click the sync icon in the OliveX sidebar or run:
`OliveX: Pull Bugs from 0xHunter`

## Development

### Watch Mode

For automatic recompilation on file changes:

```bash
npm run watch
```

### Debugging

1. Set breakpoints in your TypeScript code
2. Press `F5` to start debugging
3. The debugger will attach to the Extension Development Host

### Testing

Run tests:

```bash
npm test
```

## Build for Distribution

### Package Extension

```bash
npm install -g vsce
vsce package
```

This creates a `.vsix` file that can be installed or published.

### Install Locally

```bash
code --install-extension olivex-0.1.0.vsix
```

### Publish to Marketplace

```bash
vsce publish
```

## Project Structure

```
oliviaVscode/
├── src/                      # TypeScript source code
│   ├── extension.ts          # Main entry point
│   ├── types.ts              # Type definitions
│   ├── api/                  # API integration
│   │   └── hunter-client.ts  # 0xHunter API client
│   ├── claude/               # Claude Code integration
│   │   └── code-integration.ts
│   ├── commands/             # VSCode commands
│   │   ├── configure.ts
│   │   ├── pullBugs.ts
│   │   ├── fixBug.ts
│   │   ├── markFixed.ts
│   │   ├── viewBugDetail.ts
│   │   └── openInBrowser.ts
│   ├── providers/            # UI providers
│   │   ├── bugTreeView.ts    # Sidebar tree
│   │   └── bugDetailPanel.ts # Detail webview
│   └── config/
│       └── settings.ts       # Settings manager
├── resources/                # Static resources
│   └── shield.svg           # Extension icon
├── out/                      # Compiled JavaScript (generated)
├── package.json             # Extension manifest
├── tsconfig.json            # TypeScript config
└── README.md                # Documentation
```

## API Endpoints Used

The extension integrates with these 0xHunter API endpoints:

### Authentication
- `POST /api/v1/auth/token` - OAuth2 token

### Bugs
- `GET /api/v1/bugs` - List bugs
- `GET /api/v1/bugs/:id` - Get bug details
- `PATCH /api/v1/bugs/:id/status` - Update status

### Programs
- `GET /api/v1/programs` - List programs

## Configuration Options

Set in VSCode settings (`settings.json`):

```json
{
  "olivex.apiBaseUrl": "https://api.0xhunter.io",
  "olivex.autoRefresh": false,
  "olivex.refreshInterval": 300
}
```

## Troubleshooting

### Extension not loading

1. Check VSCode version (requires 1.80.0+)
2. Run `npm run compile` to ensure code is built
3. Check Output panel for errors

### API connection issues

1. Verify credentials in Command Palette
2. Check `olivex.apiBaseUrl` setting
3. Test connection: Run `OliveX: Configure 0xHunter Credentials`

### Claude Code not working

1. Install Claude Code CLI: `npm install -g @anthropic-ai/claude-code`
2. Ensure workspace folder is open
3. Check terminal output for errors

## Next Steps

1. **Customize API URLs**: Update `olivex.apiBaseUrl` if using a different environment
2. **Add Custom Icons**: Replace `resources/shield.svg` with your branding
3. **Extend Features**: Add more commands in `src/commands/`
4. **Add Tests**: Create tests in `src/test/`

## Support

For issues or questions:
- Email: damian@olivex-security.com
- GitHub: (add repo URL)
- 0xHunter: https://0xhunter.io

---

Happy Hacking! 🛡️
