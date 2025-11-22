# OliveX Extension Configuration Examples

## VSCode Settings

Add these to your `settings.json`:

```json
{
  // OliveX Security Extension Settings
  "olivex.apiBaseUrl": "https://api.0xhunter.io",
  "olivex.autoRefresh": true,
  "olivex.refreshInterval": 300,
  
  // Recommended VSCode settings for security development
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll": true
  },
  "files.exclude": {
    "**/.olivex": true  // Hide .olivex directory from explorer
  }
}
```

## Environment-Specific Configurations

### Development
```json
{
  "olivex.apiBaseUrl": "http://localhost:8000",
  "olivex.autoRefresh": false
}
```

### Staging
```json
{
  "olivex.apiBaseUrl": "https://staging-api.0xhunter.io",
  "olivex.autoRefresh": true,
  "olivex.refreshInterval": 600
}
```

### Production
```json
{
  "olivex.apiBaseUrl": "https://api.0xhunter.io",
  "olivex.autoRefresh": true,
  "olivex.refreshInterval": 300
}
```

## API Response Examples

### Bug Object
```json
{
  "id": "bug-123e4567-e89b-12d3-a456-426614174000",
  "title": "SQL Injection in User Login",
  "severity": "critical",
  "status": "new",
  "description": "The login endpoint is vulnerable to SQL injection...",
  "affectedFile": "src/api/auth/login.py",
  "affectedLines": [45, 52],
  "affectedUrl": "https://example.com/api/login",
  "cweId": "CWE-89",
  "cvssScore": 9.8,
  "proofOfConcept": "username=admin' OR '1'='1'--&password=test",
  "recommendation": "Use parameterized queries instead of string concatenation",
  "reportedBy": "researcher@example.com",
  "reportedAt": "2024-01-15T10:30:00Z",
  "programId": "prog-123",
  "programName": "Example Corp Bug Bounty",
  "tags": ["sql-injection", "authentication", "owasp-top-10"]
}
```

### Authentication Response
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

### Bugs List Response
```json
{
  "bugs": [
    {
      "id": "bug-123",
      "title": "XSS in Dashboard",
      "severity": "high",
      "status": "triaged"
    }
  ],
  "total": 42,
  "page": 1,
  "pageSize": 100
}
```

## Claude Code Context File Example

See `examples/bug-context-example.md` for a full example of what gets generated in `.olivex/` directory.

## Common Customizations

### Add Custom Severity Colors

Edit `src/providers/bugTreeView.ts`:

```typescript
private getIconPath(): vscode.ThemeIcon {
  const colorMap: Record<BugSeverity, vscode.ThemeColor> = {
    [BugSeverity.CRITICAL]: new vscode.ThemeColor('errorForeground'),
    [BugSeverity.HIGH]: new vscode.ThemeColor('editorWarning.foreground'),
    [BugSeverity.MEDIUM]: new vscode.ThemeColor('editorInfo.foreground'),
    [BugSeverity.LOW]: new vscode.ThemeColor('charts.green'),
    [BugSeverity.INFO]: new vscode.ThemeColor('charts.blue'),
  };
  // ... rest of code
}
```

### Customize Claude Code Prompt

Edit `src/claude/code-integration.ts` in the `formatBugForClaude()` method:

```typescript
private formatBugForClaude(bug: Bug): string {
  // Customize the markdown template here
  // Add your own sections, instructions, or formatting
}
```

### Add Custom Commands

1. Create new command file in `src/commands/`
2. Register in `src/extension.ts`
3. Add to `package.json` under `contributes.commands`

## Testing Configuration

### Mock API Responses

For testing without real API:

```typescript
// In src/api/hunter-client.ts
async getBugs(): Promise<BugsResponse> {
  if (process.env.MOCK_API === 'true') {
    return {
      bugs: [/* mock data */],
      total: 10,
      page: 1,
      pageSize: 100
    };
  }
  // ... real implementation
}
```

## Troubleshooting

### Enable Debug Logging

Add to extension code:

```typescript
const outputChannel = vscode.window.createOutputChannel('OliveX Debug');
outputChannel.appendLine('Debug message here');
outputChannel.show();
```

### Network Debugging

Set environment variable:
```bash
NODE_DEBUG=http,https code .
```

### API Call Tracing

Add axios interceptor in `hunter-client.ts`:

```typescript
this.axiosInstance.interceptors.request.use(request => {
  console.log('Starting Request', request);
  return request;
});
```

## Production Checklist

- [ ] Update `apiBaseUrl` to production
- [ ] Remove all console.log statements
- [ ] Test with production credentials
- [ ] Verify error handling
- [ ] Test rate limiting
- [ ] Update version in package.json
- [ ] Update CHANGELOG
- [ ] Build and test .vsix package
- [ ] Test installation from .vsix
- [ ] Verify all commands work
- [ ] Check memory leaks

---

For more information, see:
- SETUP.md - Installation instructions
- DEVELOPMENT.md - Developer guide
- README.md - User documentation
