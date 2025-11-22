#!/bin/bash

# Fix 1: XSS in bugDetailPanel.ts (line 277)
echo "🔧 Fixing XSS vulnerability in bugDetailPanel.ts..."

cat > /Users/gamba/Desktop/Hacking/olive/oliviaVscode/FIX_XSS.patch << 'EOF'
Replace line 277 in src/providers/bugDetailPanel.ts:

OLD CODE (VULNERABLE):
    <script>
        const vscode = acquireVsCodeApi();
        const bug = ${JSON.stringify(bug)};
        
NEW CODE (SECURE):
    <script>
        const vscode = acquireVsCodeApi();
        let bug = null;

        // Receive bug data safely via postMessage
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'bugData') {
                bug = message.bug;
            }
        });

ALSO ADD after line ~65 in the update() method:
  public update(bug: Bug) {
    this._panel.title = \`Bug: \${bug.title}\`;
    this._panel.webview.html = this._getHtmlForWebview(bug);
    
    // NUEVA LÍNEA: Send bug data safely via postMessage
    this._panel.webview.postMessage({ type: 'bugData', bug: bug });
  }

AND UPDATE functions to check if bug exists:
        function fixBug() {
            if (bug) {
                vscode.postMessage({ command: 'fixBug', bug: bug });
            }
        }
        // Same for markFixed() and openInBrowser()
EOF

echo "✅ XSS fix documented in FIX_XSS.patch"

# Fix 2: URL construction in openInBrowser.ts
echo "🔧 Fixing URL construction in openInBrowser.ts..."

cat > /Users/gamba/Desktop/Hacking/olive/oliviaVscode/FIX_URL.patch << 'EOF'
Replace lines 18-21 in src/commands/openInBrowser.ts:

OLD CODE (BUGGY):
    const baseUrl = configManager.getApiBaseUrl();
    const portalUrl = baseUrl.replace('/api', '');
    const bugUrl = \`\${portalUrl}/bugs/\${bug.id}\`;

NEW CODE (CORRECT):
    const apiBaseUrl = configManager.getApiBaseUrl();
    
    // Parse API URL and construct portal URL correctly
    let portalUrl: string;
    try {
      const apiUrl = new URL(apiBaseUrl);
      // Remove /api from pathname, keep the domain intact
      apiUrl.pathname = apiUrl.pathname.replace(/\/api(\/|$)/, '/');
      portalUrl = apiUrl.toString().replace(/\/$/, ''); // Remove trailing slash
    } catch (error) {
      // Fallback: assume portal is at root domain
      portalUrl = apiBaseUrl.replace(/\/api.*$/, '');
    }
    
    const bugUrl = \`\${portalUrl}/bugs/\${bug.id}\`;
EOF

echo "✅ URL fix documented in FIX_URL.patch"

# Fix 3: activationEvents in package.json
echo "🔧 Fixing activationEvents in package.json..."

cat > /Users/gamba/Desktop/Hacking/olive/oliviaVscode/FIX_ACTIVATION.patch << 'EOF'
In package.json, replace activationEvents (lines 21-25):

OLD CODE (INCOMPLETE):
  "activationEvents": [
    "onCommand:olivex.configure",
    "onCommand:olivex.pullBugs",
    "onView:olivexBugs"
  ],

NEW CODE (COMPLETE):
  "activationEvents": [
    "onStartupFinished"
  ],

ALTERNATIVELY (more granular):
  "activationEvents": [
    "onCommand:olivex.configure",
    "onCommand:olivex.pullBugs",
    "onCommand:olivex.refreshBugs",
    "onCommand:olivex.fixBug",
    "onCommand:olivex.viewBugDetail",
    "onCommand:olivex.markFixed",
    "onCommand:olivex.openInBrowser",
    "onView:olivexBugs"
  ],
EOF

echo "✅ Activation fix documented in FIX_ACTIVATION.patch"

echo ""
echo "📋 Summary of fixes needed:"
echo "1. FIX_XSS.patch - Prevents XSS in webview"
echo "2. FIX_URL.patch - Fixes URL construction"  
echo "3. FIX_ACTIVATION.patch - Enables all commands on startup"
echo ""
echo "⚠️  Apply these patches manually and then rebuild"
