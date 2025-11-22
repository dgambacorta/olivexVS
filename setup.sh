#!/bin/bash

# OliveX VSCode Extension - Quick Start Script

set -e

echo "🛡️  OliveX Security - VSCode Extension Setup"
echo "=============================================="
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the extension root directory."
    exit 1
fi

# Check Node.js installation
echo "📦 Checking Node.js installation..."
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "⚠️  Warning: Node.js version is less than 18. Some features may not work correctly."
fi

echo "✅ Node.js $(node -v) detected"
echo ""

# Check npm installation
echo "📦 Checking npm installation..."
if ! command -v npm &> /dev/null; then
    echo "❌ Error: npm is not installed."
    exit 1
fi
echo "✅ npm $(npm -v) detected"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install
echo "✅ Dependencies installed"
echo ""

# Compile TypeScript
echo "🔨 Compiling TypeScript..."
npm run compile
echo "✅ TypeScript compiled successfully"
echo ""

# Check Claude Code CLI
echo "🤖 Checking Claude Code CLI..."
if ! command -v claude-code &> /dev/null; then
    echo "⚠️  Claude Code CLI not found. Installing..."
    npm install -g @anthropic-ai/claude-code || {
        echo "⚠️  Warning: Could not install Claude Code CLI globally."
        echo "   You can install it manually with: npm install -g @anthropic-ai/claude-code"
    }
else
    echo "✅ Claude Code CLI detected"
fi
echo ""

# Success message
echo "=============================================="
echo "✅ Setup completed successfully!"
echo ""
echo "Next steps:"
echo "1. Open this folder in VSCode"
echo "2. Press F5 to launch Extension Development Host"
echo "3. In the new window, run: 'OliveX: Configure 0xHunter Credentials'"
echo "4. Enter your clientId and clientSecret from 0xhunter.io"
echo "5. Run: 'OliveX: Pull Bugs from 0xHunter'"
echo ""
echo "For development:"
echo "  npm run watch    - Watch mode for auto-compilation"
echo "  npm run compile  - Manual compilation"
echo "  npm test         - Run tests"
echo ""
echo "Documentation:"
echo "  README.md        - User documentation"
echo "  SETUP.md         - Setup instructions"
echo "  DEVELOPMENT.md   - Developer guide"
echo ""
echo "🛡️  Happy hacking with OliveX Security!"
echo "=============================================="
