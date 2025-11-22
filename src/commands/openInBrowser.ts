import * as vscode from 'vscode';
import { ConfigManager } from '../config/settings';
import { Bug } from '../types';

export async function registerOpenInBrowserCommand(
  context: vscode.ExtensionContext,
  configManager: ConfigManager
): Promise<void> {
  context.subscriptions.push(
    vscode.commands.registerCommand('olivex.openInBrowser', async (item?: any) => {
      try {
        const bug: Bug = item?.bug || item;

        if (!bug || !bug.id) {
          vscode.window.showErrorMessage('No bug selected');
          return;
        }

        // Construir la URL del portal 0xHunter
        // Si API es https://api.0xhunter.io → portal es https://0xhunter.io
        const apiBaseUrl = configManager.getApiBaseUrl();
        let portalUrl: string;
        try {
          const apiUrl = new URL(apiBaseUrl);
          // Remover 'api.' del hostname
          const portalHostname = apiUrl.hostname.replace(/^api\./, '');
          portalUrl = `${apiUrl.protocol}//${portalHostname}`;
        } catch (error) {
          // Fallback: asumir que el portal está en 0xhunter.io
          portalUrl = 'https://0xhunter.io';
        }

        // Open in default browser
        await vscode.env.openExternal(vscode.Uri.parse(portalUrl));

      } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to open bug in browser: ${error.message}`);
      }
    })
  );
}
