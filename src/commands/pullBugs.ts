import * as vscode from 'vscode';
import { ConfigManager } from '../config/settings';
import { HunterClient } from '../api/hunter-client';
import { BugTreeProvider } from '../providers/bugTreeView';

export async function registerPullBugsCommand(
  context: vscode.ExtensionContext,
  configManager: ConfigManager,
  treeProvider: BugTreeProvider
): Promise<void> {
  context.subscriptions.push(
    vscode.commands.registerCommand('olivex.pullBugs', async () => {
      try {
        // Check if credentials are configured
        if (!(await configManager.hasCredentials())) {
          const result = await vscode.window.showWarningMessage(
            'OliveX credentials not configured',
            'Configure Now'
          );
          if (result === 'Configure Now') {
            await vscode.commands.executeCommand('olivex.configure');
          }
          return;
        }

        // Get credentials
        const clientId = await configManager.getClientId();
        const clientSecret = await configManager.getClientSecret();
        const baseUrl = configManager.getApiBaseUrl();

        if (!clientId || !clientSecret) {
          throw new Error('Credentials not found');
        }

        // Create client
        const client = new HunterClient({
          clientId,
          clientSecret,
          baseUrl,
        });

        // Pull bugs with progress
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Pulling bugs from 0xHunter...',
            cancellable: false,
          },
          async (progress) => {
            progress.report({ increment: 20, message: 'Authenticating...' });
            await client.authenticate();

            progress.report({ increment: 30, message: 'Fetching bugs...' });
            const response = await client.getBugs();
            
            console.log('[PullBugs] API Response:', JSON.stringify(response, null, 2));
            console.log('[PullBugs] response.bugs type:', typeof response.bugs);
            console.log('[PullBugs] response.bugs:', response.bugs);

            progress.report({ increment: 40, message: 'Updating tree view...' });
            
            // Handle different response formats
            const bugs = response.bugs || response.reports || [];
            console.log('[PullBugs] Parsed bugs array:', bugs);
            
            // Filter by status configuration
            const config = vscode.workspace.getConfiguration('olivex');
            const statusFilter = config.get<string[]>('statusFilter', ['Validated']);
            console.log('[PullBugs] Status filter:', statusFilter);
            
            const filteredBugs = bugs.filter((bug: any) => 
              statusFilter.length === 0 || statusFilter.includes(bug.status)
            );
            console.log('[PullBugs] Filtered bugs count:', filteredBugs.length);
            
            treeProvider.refresh(filteredBugs);

            progress.report({ increment: 10 });

            // Show summary
            const summary = {
              total: filteredBugs.length || 0,
              critical: filteredBugs.filter((b: any) => b.severity?.toLowerCase() === 'critical').length,
              high: filteredBugs.filter((b: any) => b.severity?.toLowerCase() === 'high').length,
              medium: filteredBugs.filter((b: any) => b.severity?.toLowerCase() === 'medium').length,
              low: filteredBugs.filter((b: any) => b.severity?.toLowerCase() === 'low').length,
            };

            const message = `Found ${summary.total} bug${summary.total !== 1 ? 's' : ''}: ${summary.critical} Critical, ${summary.high} High, ${summary.medium} Medium, ${summary.low} Low`;
            
            if (summary.total > 0) {
              vscode.window.showInformationMessage(`✅ ${message}`);
            } else {
              vscode.window.showInformationMessage('No bugs found. Great job! 🎉');
            }
          }
        );

      } catch (error: any) {
        vscode.window.showErrorMessage(
          `Failed to pull bugs: ${error.message}`,
          'Retry',
          'Configure'
        ).then(selection => {
          if (selection === 'Retry') {
            vscode.commands.executeCommand('olivex.pullBugs');
          } else if (selection === 'Configure') {
            vscode.commands.executeCommand('olivex.configure');
          }
        });
      }
    })
  );

  // Also register refresh command (alias for pull)
  context.subscriptions.push(
    vscode.commands.registerCommand('olivex.refreshBugs', () => {
      return vscode.commands.executeCommand('olivex.pullBugs');
    })
  );
}
