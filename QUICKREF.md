# Quick Reference - OliveX VSCode Extension

## 🚀 Quick Commands

### Setup
```bash
npm install              # Install dependencies
npm run compile          # Compile TypeScript
npm run watch            # Watch mode (auto-compile)
```

### Development
```bash
# Press F5 in VSCode to launch Extension Development Host
npm run lint             # Check code quality
npm test                 # Run tests (when implemented)
```

### Build & Package
```bash
npm run vscode:prepublish  # Prepare for publishing
vsce package               # Create .vsix file
code --install-extension olivex-0.1.0.vsix  # Install locally
```

## 📋 VSCode Commands

Open Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`) and run:

- `OliveX: Configure 0xHunter Credentials`
- `OliveX: Pull Bugs from 0xHunter`
- `OliveX: Refresh Bug List`
- `OliveX: Fix Bug with Claude Code`
- `OliveX: View Bug Details`
- `OliveX: Mark as Fixed`
- `OliveX: Open in 0xHunter`

## 🎯 Key Files

| File | Purpose |
|------|---------|
| `src/extension.ts` | Entry point, command registration |
| `src/api/hunter-client.ts` | 0xHunter API integration |
| `src/claude/code-integration.ts` | Claude Code bridge |
| `src/providers/bugTreeView.ts` | Sidebar tree view |
| `src/providers/bugDetailPanel.ts` | Bug detail webview |
| `src/commands/*.ts` | Individual commands |
| `package.json` | Extension manifest |

## 🔧 Configuration

### Settings (settings.json)
```json
{
  "olivex.apiBaseUrl": "https://api.0xhunter.io",
  "olivex.autoRefresh": false,
  "olivex.refreshInterval": 300
}
```

### Credentials
Stored securely in VSCode Secret Storage:
- Client ID
- Client Secret

## 🐛 Debug Tips

1. **View Logs**: Output Panel → "Extension Host"
2. **Set Breakpoints**: In TypeScript files
3. **Debug Console**: While debugging (F5)
4. **Reload Window**: `Cmd+R` / `Ctrl+R` in Extension Development Host

## 📊 Project Structure

```
oliviaVscode/
├── src/                   # TypeScript source
│   ├── extension.ts       # Main entry
│   ├── types.ts          # Type definitions
│   ├── api/              # API client
│   ├── claude/           # Claude Code integration
│   ├── commands/         # Command handlers
│   ├── providers/        # UI providers
│   └── config/           # Configuration
├── resources/            # Icons and assets
├── examples/            # Example files
├── out/                 # Compiled JS (generated)
├── package.json         # Manifest
├── tsconfig.json        # TS config
└── README.md           # Documentation
```

## 🎨 Color Codes by Severity

| Severity | Color | Icon |
|----------|-------|------|
| Critical | Red #d32f2f | 🔴 |
| High | Orange #f57c00 | 🟠 |
| Medium | Yellow #fbc02d | 🟡 |
| Low | Green #388e3c | 🟢 |
| Info | Blue #1976d2 | 🔵 |

## 🔗 API Endpoints

```
POST   /api/v1/auth/token           # Authenticate
GET    /api/v1/bugs                 # List bugs
GET    /api/v1/bugs/:id             # Get bug detail
PATCH  /api/v1/bugs/:id/status      # Update status
GET    /api/v1/programs             # List programs
```

## 🧪 Testing Scenarios

- [ ] Fresh install with no credentials
- [ ] Configure valid credentials
- [ ] Configure invalid credentials
- [ ] Pull bugs (empty list)
- [ ] Pull bugs (with results)
- [ ] View bug details
- [ ] Fix bug with Claude Code
- [ ] Mark bug as fixed
- [ ] Open in browser
- [ ] Auto-refresh on/off
- [ ] Multiple workspaces
- [ ] No workspace open

## ⚡ Performance

- Tree view uses lazy loading
- API calls are throttled
- Context files cleaned up periodically
- Tokens cached until expiry
- Only active workspace monitored

## 🛠️ Troubleshooting

### Extension not loading
```bash
npm run compile
# Check Output Panel → Extension Host for errors
```

### API connection fails
- Verify credentials: Run "Configure" command
- Check `olivex.apiBaseUrl` setting
- Test network connectivity

### Claude Code not working
```bash
npm install -g @anthropic-ai/claude-code
# Ensure workspace folder is open
```

### Tree view empty
- Check credentials are configured
- Run "Pull Bugs" command
- Check API connection

## 📦 Dependencies

```json
{
  "axios": "^1.6.0",           // HTTP client
  "@types/vscode": "^1.80.0",  // VSCode API types
  "typescript": "^5.2.0"       // TypeScript compiler
}
```

## 🔐 Security Notes

- Credentials in VSCode Secret Storage
- HTTPS-only API calls
- OAuth2 token management
- No sensitive data in logs
- .olivex/ contains only formatted bug info

## 📱 Shortcuts

| Action | Shortcut |
|--------|----------|
| Open Command Palette | `Cmd+Shift+P` / `Ctrl+Shift+P` |
| Reload Window | `Cmd+R` / `Ctrl+R` |
| Toggle Sidebar | `Cmd+B` / `Ctrl+B` |
| Open Settings | `Cmd+,` / `Ctrl+,` |

## 🎓 Resources

- [VSCode Extension API](https://code.visualstudio.com/api)
- [0xHunter Docs](https://docs.0xhunter.io)
- [Claude Code CLI](https://github.com/anthropics/claude-code)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

---

**Quick Start**: `./setup.sh` → Press `F5` → Configure credentials → Pull bugs!
