import * as vscode from 'vscode';
import { ConfigManager } from '../config/settings';
import { HunterClient } from '../api/hunter-client';
import { BugTreeProvider, BugItem } from '../providers/bugTreeView';
import { BugStatus } from '../types';

export async function registerMarkFixedCommand(
  context: vscode.ExtensionContext,
  configManager: ConfigManager,
  treeProvider: BugTreeProvider
): Promise<void> {
  context.subscriptions.push(
    vscode.commands.registerCommand('olivex.markFixed', async (item: BugItem) => {
      try {
        if (!item || !item.bug) {
          vscode.window.showErrorMessage('No bug selected');
          return;
        }

        const bug = item.bug;

        // Confirm action
        const confirm = await vscode.window.showWarningMessage(
          `Mark bug as fixed: ${bug.title}?`,
          {
            modal: true,
            detail: 'This will update the bug status in 0xHunter to "fixed".',
          },
          'Mark as Fixed',
          'Cancel'
        );

        if (confirm !== 'Mark as Fixed') {
          return;
        }

        // Optional: Ask for comment
        const comment = await vscode.window.showInputBox({
          prompt: 'Add a comment (optional)',
          placeHolder: 'E.g., Fixed by implementing input validation',
        });

        // Get credentials
        const clientId = await configManager.getClientId();
        const clientSecret = await configManager.getClientSecret();
        const baseUrl = configManager.getApiBaseUrl();

        if (!clientId || !clientSecret) {
          throw new Error('Credentials not configured');
        }

        // Create client
        const client = new HunterClient({
          clientId,
          clientSecret,
          baseUrl,
        });

        // Update status with progress
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Updating bug status...',
            cancellable: false,
          },
          async (progress) => {
            progress.report({ increment: 50 });
            await client.updateBugStatus(bug.id, BugStatus.FIXED, comment);
            progress.report({ increment: 50 });
          }
        );

        vscode.window.showInformationMessage(
          `✅ Bug marked as fixed: ${bug.title}`
        );

        // Refresh the tree to update status
        await vscode.commands.executeCommand('olivex.pullBugs');

      } catch (error: any) {
        vscode.window.showErrorMessage(
          `Failed to mark bug as fixed: ${error.message}`
        );
      }
    })
  );
}
