#!/bin/bash

echo "🛡️  OliveX Extension - Installation Script"
echo "=========================================="
echo ""

# Navigate to extension directory
cd "$(dirname "$0")"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install Node.js first."
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

# Compile TypeScript
echo "🔨 Compiling TypeScript..."
npm run compile

if [ $? -ne 0 ]; then
    echo "❌ Failed to compile"
    exit 1
fi

# Check if vsce is installed
if ! command -v vsce &> /dev/null; then
    echo "📥 Installing vsce..."
    npm install -g @vscode/vsce
fi

# Package extension
echo "📦 Creating .vsix package..."
vsce package --no-git-tag-version --no-update-package-json

if [ $? -ne 0 ]; then
    echo "❌ Failed to create package"
    exit 1
fi

# Find the .vsix file
VSIX_FILE=$(ls -t olivex-*.vsix 2>/dev/null | head -1)

if [ -z "$VSIX_FILE" ]; then
    echo "❌ Could not find .vsix file"
    exit 1
fi

# Install extension
echo "🚀 Installing extension in VSCode..."
code --install-extension "$VSIX_FILE" --force

if [ $? -ne 0 ]; then
    echo "❌ Failed to install extension"
    exit 1
fi

echo ""
echo "✅ OliveX Extension installed successfully!"
echo ""
echo "Next steps:"
echo "1. Restart VSCode or reload window (Cmd+Shift+P -> 'Reload Window')"
echo "2. Look for the OliveX shield icon in the activity bar"
echo "3. Run: 'OliveX: Configure 0xHunter Credentials'"
echo ""
echo "🎉 Happy hunting!"
