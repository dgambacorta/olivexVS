import * as vscode from 'vscode';
import { BugItem } from '../providers/bugTreeView';
import { BugDetailPanel } from '../providers/bugDetailPanel';

export async function registerViewBugDetailCommand(
  context: vscode.ExtensionContext
): Promise<void> {
  context.subscriptions.push(
    vscode.commands.registerCommand('olivex.viewBugDetail', async (item: BugItem) => {
      try {
        if (!item || !item.bug) {
          vscode.window.showErrorMessage('No bug selected');
          return;
        }

        BugDetailPanel.show(item.bug, context.extensionUri);

      } catch (error: any) {
        vscode.window.showErrorMessage(
          `Failed to show bug details: ${error.message}`
        );
      }
    })
  );
}
