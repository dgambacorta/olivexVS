#!/bin/bash
cd /Users/gamba/Desktop/Hacking/olive/oliviaVscode
npm run compile && \
rm -f olivex-0.1.0.vsix && \
vsce package --allow-missing-repository && \
code --uninstall-extension olivex-security.olivex && \
code --install-extension olivex-0.1.0.vsix && \
echo "✅ Extension rebuilt and reinstalled! Please reload VSCode window."
