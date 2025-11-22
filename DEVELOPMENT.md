# OliveX VSCode Extension - Development Guide

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ and npm
- VSCode 1.80.0+
- TypeScript knowledge
- 0xHunter API credentials

### Installation

```bash
cd /Users/gamba/Desktop/Hacking/olive/oliviaVscode
npm install
npm run compile
```

### Run in Development

1. Open the project in VSCode
2. Press `F5` to launch Extension Development Host
3. Test your changes in the new VSCode window

## 🏗️ Architecture Overview

### Core Components

#### 1. Extension Entry (`src/extension.ts`)
- Activates the extension
- Registers all commands
- Sets up tree view and providers
- Handles auto-refresh

#### 2. API Client (`src/api/hunter-client.ts`)
- OAuth2 authentication with 0xHunter
- CRUD operations for bugs
- Token management and refresh
- Error handling

#### 3. Claude Code Bridge (`src/claude/code-integration.ts`)
- Creates bug context files in `.olivex/`
- Formats bug information for Claude Code
- Launches terminal with Claude Code command
- Manages context file lifecycle

#### 4. UI Providers
- **BugTreeProvider** (`src/providers/bugTreeView.ts`)
  - Hierarchical view grouped by severity
  - Custom icons and colors
  - Context menus
  
- **BugDetailPanel** (`src/providers/bugDetailPanel.ts`)
  - WebView with rich bug information
  - Interactive buttons
  - Styled with VSCode theme colors

#### 5. Commands (`src/commands/`)
Each command is in its own file:
- `configure.ts` - Setup credentials
- `pullBugs.ts` - Fetch from API
- `fixBug.ts` - Launch Claude Code
- `markFixed.ts` - Update status
- `viewBugDetail.ts` - Show detail panel
- `openInBrowser.ts` - External link

## 🔧 How It Works

### Workflow: Fix a Bug

```
User clicks "Fix Bug"
    ↓
fixBug.ts command executes
    ↓
ClaudeCodeBridge.fixBug() called
    ↓
Creates .olivex/bug-{id}.md with:
    - Bug description
    - Proof of concept
    - Recommendations
    - Instructions for Claude
    ↓
Opens terminal and runs:
    claude-code "Fix the security vulnerability in .olivex/bug-{id}.md"
    ↓
Claude Code:
    1. Reads the context file
    2. Analyzes the codebase
    3. Locates vulnerable code
    4. Proposes secure fixes
    5. Implements changes
    6. Adds tests
```

### Data Flow

```
0xHunter API
    ↓ (OAuth2)
HunterClient
    ↓ (Bug[])
BugTreeProvider
    ↓ (User selection)
Commands
    ↓
ClaudeCodeBridge OR BugDetailPanel OR API Update
```

## 🎨 Adding New Features

### Add a New Command

1. Create file: `src/commands/myNewCommand.ts`

```typescript
import * as vscode from 'vscode';
import { BugItem } from '../providers/bugTreeView';

export async function registerMyNewCommand(
  context: vscode.ExtensionContext
): Promise<void> {
  context.subscriptions.push(
    vscode.commands.registerCommand('olivex.myNewCommand', async (item: BugItem) => {
      try {
        // Your logic here
        vscode.window.showInformationMessage('Command executed!');
      } catch (error: any) {
        vscode.window.showErrorMessage(`Error: ${error.message}`);
      }
    })
  );
}
```

2. Register in `src/extension.ts`:

```typescript
import { registerMyNewCommand } from './commands/myNewCommand';

export function activate(context: vscode.ExtensionContext) {
  // ... existing code ...
  registerMyNewCommand(context);
}
```

3. Add to `package.json`:

```json
{
  "contributes": {
    "commands": [
      {
        "command": "olivex.myNewCommand",
        "title": "OliveX: My New Command",
        "icon": "$(icon-name)"
      }
    ]
  }
}
```

### Add a New Setting

1. Add to `package.json`:

```json
{
  "contributes": {
    "configuration": {
      "properties": {
        "olivex.myNewSetting": {
          "type": "string",
          "default": "default-value",
          "description": "Description of the setting"
        }
      }
    }
  }
}
```

2. Access in code:

```typescript
const config = vscode.workspace.getConfiguration('olivex');
const mySetting = config.get<string>('myNewSetting');
```

## 🐛 Debugging

### Enable Logging

Add console.log statements - they appear in:
- **Debug Console** (when debugging)
- **Output Panel** → "Extension Host"

### Common Issues

**Extension not activating:**
- Check `activationEvents` in package.json
- Verify TypeScript compilation succeeded
- Check for errors in Output panel

**Commands not appearing:**
- Ensure command is registered in package.json
- Check `contributes.commands` section
- Reload window after changes

**API errors:**
- Test credentials with configure command
- Check network/CORS settings
- Verify API endpoint URLs

## 🧪 Testing

### Manual Testing Checklist

- [ ] Configure credentials (valid and invalid)
- [ ] Pull bugs successfully
- [ ] View bug details
- [ ] Fix bug with Claude Code
- [ ] Mark bug as fixed
- [ ] Open bug in browser
- [ ] Test with no workspace open
- [ ] Test auto-refresh
- [ ] Test with empty bug list

### Unit Tests (TODO)

Create tests in `src/test/`:

```typescript
import * as assert from 'assert';
import { HunterClient } from '../api/hunter-client';

suite('HunterClient Tests', () => {
  test('Authentication works', async () => {
    // Test implementation
  });
});
```

## 📦 Packaging & Distribution

### Build Extension

```bash
npm run compile
vsce package
```

Creates: `olivex-0.1.0.vsix`

### Install Locally

```bash
code --install-extension olivex-0.1.0.vsix
```

### Publish to Marketplace

1. Create publisher account on [marketplace](https://marketplace.visualstudio.com/)
2. Get Personal Access Token
3. Login and publish:

```bash
vsce login YOUR_PUBLISHER_NAME
vsce publish
```

## 🔐 Security Considerations

### Credential Storage
- Uses VSCode SecretStorage API
- Never log credentials
- Clear on extension deactivation

### API Communication
- HTTPS only
- OAuth2 token refresh
- Handle token expiry gracefully

### Code Generation
- Review Claude Code changes before committing
- Validate fixes don't introduce new vulnerabilities
- Run security tests after fixes

## 🚀 Performance Tips

1. **Lazy Loading**: Only load bugs when needed
2. **Caching**: Cache bug list in memory
3. **Throttling**: Limit API calls
4. **Cleanup**: Delete old .olivex files regularly
5. **Tree View**: Use collapsible groups

## 📝 Code Style

- Use TypeScript strict mode
- Follow ESLint rules
- Add JSDoc comments for public APIs
- Use async/await over promises
- Handle errors with try/catch

## 🎯 Roadmap Ideas

- [ ] Support multiple bug bounty platforms
- [ ] AI-powered vulnerability detection
- [ ] Git integration for fixes
- [ ] Team collaboration features
- [ ] Custom severity filters
- [ ] Bulk bug operations
- [ ] Automated test generation
- [ ] Integration with CI/CD
- [ ] Security metrics dashboard
- [ ] Export reports to PDF

## 📚 Useful Resources

- [VSCode Extension API](https://code.visualstudio.com/api)
- [TreeView Guide](https://code.visualstudio.com/api/extension-guides/tree-view)
- [WebView Guide](https://code.visualstudio.com/api/extension-guides/webview)
- [Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Make changes
4. Test thoroughly
5. Submit pull request

---

**Happy Coding! 🛡️**

Made with ❤️ by OliveX Security
