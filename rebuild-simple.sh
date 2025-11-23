#!/bin/bash

echo "🔨 Rebuilding OliveX Extension..."
cd /Users/gamba/Desktop/Hacking/olive/oliviaVscode

# Compile TypeScript
echo "📦 Compiling TypeScript..."
npm run compile

if [ $? -ne 0 ]; then
    echo "❌ Compilation failed"
    exit 1
fi

echo "✅ Extension rebuilt successfully!"
echo ""
echo "📋 Next steps:"
echo "1. Open VSCode"
echo "2. Press Cmd+Shift+P"
echo "3. Run 'Developer: Reload Window'"
echo ""
