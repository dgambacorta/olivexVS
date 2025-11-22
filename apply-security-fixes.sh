#!/bin/bash

echo "🔧 Applying Security Fixes to OliveX Extension"
echo "=============================================="

cd /Users/gamba/Desktop/Hacking/olive/oliviaVscode

# Backup originals
echo "📦 Creating backups..."
cp src/commands/openInBrowser.ts src/commands/openInBrowser.ts.backup
cp package.json package.json.backup

# Fix 1: Update openInBrowser.ts
echo "🔧 Fix 1: Correcting URL construction..."
cp src/commands/openInBrowser.ts.fixed src/commands/openInBrowser.ts

# Fix 2: Update package.json activationEvents
echo "🔧 Fix 2: Fixing activation events..."
cat > /tmp/package_activation.json << 'EOF'
  "activationEvents": [
    "onStartupFinished"
  ],
EOF

# Use sed to replace activationEvents
sed -i.bak '/"activationEvents": \[/,/\],/{
  /"activationEvents": \[/!{
    /\],/!d
  }
}' package.json

# Insert the new activation line
sed -i.bak '/"activationEvents": \[/r /tmp/package_activation.json' package.json
sed -i.bak '/"activationEvents": \[/d' package.json

# Fix 3: XSS in bugDetailPanel.ts (manual instructions since it's complex)
cat > MANUAL_FIX_REQUIRED.txt << 'EOF'
⚠️  MANUAL FIX REQUIRED for bugDetailPanel.ts

Line ~277 currently has:
    const bug = ${JSON.stringify(bug)};

CHANGE TO:
    let bug = null;
    window.addEventListener('message', event => {
        const message = event.data;
        if (message.type === 'bugData') {
            bug = message.bug;
        }
    });

AND in the update() method (line ~65), ADD after setting HTML:
    this._panel.webview.postMessage({ type: 'bugData', bug: bug });

AND update all functions to check if bug exists:
    function fixBug() {
        if (bug) {
            vscode.postMessage({ command: 'fixBug', bug: bug });
        }
    }
    // Same for markFixed() and openInBrowser()

This prevents XSS by not injecting user-controlled data directly into <script> tags.
EOF

echo "✅ Fixes 1 & 2 applied!"
echo "⚠️  Fix 3 requires manual editing - see MANUAL_FIX_REQUIRED.txt"
echo ""
echo "Backups created:"
echo "  - src/commands/openInBrowser.ts.backup"
echo "  - package.json.backup"
echo ""
echo "Next steps:"
echo "1. Edit src/providers/bugDetailPanel.ts per MANUAL_FIX_REQUIRED.txt"
echo "2. Run: npm run package"
echo "3. Run: ./rebuild-webpack.sh"
