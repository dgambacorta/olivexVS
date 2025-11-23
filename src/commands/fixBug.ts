import * as vscode from 'vscode';
import { ClaudeCodeBridge } from '../claude/code-integration';
import { BugItem } from '../providers/bugTreeView';

export async function registerFixBugCommand(
  context: vscode.ExtensionContext,
  claudeBridge: ClaudeCodeBridge
): Promise<void> {
  context.subscriptions.push(
    vscode.commands.registerCommand('olivex.fixBug', async (item: BugItem) => {
      try {
        if (!item || !item.bug) {
          vscode.window.showErrorMessage('No bug selected');
          return;
        }

        const bug = item.bug;

        // Confirm before fixing
        const confirm = await vscode.window.showWarningMessage(
          `Fix vulnerability: ${bug.title}?`,
          {
            modal: true,
            detail: `This will:\n1. Copy the bug details to your clipboard\n2. Open Claude Code extension\n3. You can paste (Cmd+V) the vulnerability details in Claude Code\n\nSeverity: ${(bug.severity || 'Unknown').toUpperCase()}\nAffected: ${bug.target_url || 'Unknown'}`,
          },
          'Fix with AI',
          'Cancel'
        );

        if (confirm !== 'Fix with AI') {
          return;
        }

        // Initiate fix
        await claudeBridge.fixBug(bug);

        // Optional: Clean up old context files
        await claudeBridge.cleanupOldContextFiles(10);

      } catch (error: any) {
        vscode.window.showErrorMessage(
          `Failed to initiate fix: ${error.message}`
        );
      }
    })
  );
}
