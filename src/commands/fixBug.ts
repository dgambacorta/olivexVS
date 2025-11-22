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
            detail: `This will:\n1. Create a context file in .olivex/\n2. Launch Claude Code to analyze and fix the vulnerability\n\nSeverity: ${(bug.severity || 'Unknown').toUpperCase()}\nAffected: ${bug.affectedFile || bug.target_url || 'Unknown'}`,
          },
          'Fix with Claude Code',
          'Cancel'
        );

        if (confirm !== 'Fix with Claude Code') {
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
