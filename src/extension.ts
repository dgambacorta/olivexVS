import * as vscode from 'vscode';
import { ConfigManager } from './config/settings';
import { BugTreeProvider } from './providers/bugTreeView';
import { ClaudeCodeBridge } from './claude/code-integration';
import { registerConfigureCommand } from './commands/configure';
import { registerPullBugsCommand } from './commands/pullBugs';
import { registerFixBugCommand } from './commands/fixBug';
import { registerMarkFixedCommand } from './commands/markFixed';
import { registerViewBugDetailCommand } from './commands/viewBugDetail';
import { registerOpenInBrowserCommand } from './commands/openInBrowser';

let autoRefreshTimer: NodeJS.Timeout | undefined;

export function activate(context: vscode.ExtensionContext) {
  console.log('OliveX Security extension is now active');

  // Initialize managers
  const configManager = new ConfigManager(context);
  const treeProvider = new BugTreeProvider();

  // Register tree view
  const treeView = vscode.window.createTreeView('olivexBugs', {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  // Get workspace root for Claude Code integration
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    vscode.window.showWarningMessage(
      'OliveX: No workspace folder open. Some features may not work correctly.'
    );
  }

  const claudeBridge = workspaceRoot 
    ? new ClaudeCodeBridge(workspaceRoot)
    : null;

  // Register all commands
  registerConfigureCommand(context, configManager);
  registerPullBugsCommand(context, configManager, treeProvider);
  registerViewBugDetailCommand(context);
  registerOpenInBrowserCommand(context, configManager);
  registerMarkFixedCommand(context, configManager, treeProvider);
  
  // Register refresh command (alias for pullBugs)
  // REMOVED: This command is already registered elsewhere
  // context.subscriptions.push(
  //   vscode.commands.registerCommand('olivex.refreshBugs', () => {
  //     vscode.commands.executeCommand('olivex.pullBugs');
  //   })
  // );
  
  if (claudeBridge) {
    registerFixBugCommand(context, claudeBridge);
  } else {
    // Register dummy command if no workspace
    context.subscriptions.push(
      vscode.commands.registerCommand('olivex.fixBug', async () => {
        const action = await vscode.window.showWarningMessage(
          '🛠️ Fix Bug requires an open workspace folder. Please open a folder or workspace to use Claude Code integration.',
          'Open Folder',
          'Cancel'
        );
        
        if (action === 'Open Folder') {
          vscode.commands.executeCommand('vscode.openFolder');
        }
      })
    );
  }

  // Show welcome message on first activation
  const hasShownWelcome = context.globalState.get<boolean>('olivex.hasShownWelcome');
  if (!hasShownWelcome) {
    vscode.window
      .showInformationMessage(
        'Welcome to OliveX Security! Configure your 0xHunter credentials to get started.',
        'Configure Now',
        'Later'
      )
      .then((selection) => {
        if (selection === 'Configure Now') {
          vscode.commands.executeCommand('olivex.configure');
        }
      });
    context.globalState.update('olivex.hasShownWelcome', true);
  }

  // Auto-refresh bugs if enabled
  setupAutoRefresh(configManager, treeProvider);

  // Watch for configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('olivex.autoRefresh') || 
          e.affectsConfiguration('olivex.refreshInterval')) {
        setupAutoRefresh(configManager, treeProvider);
      }
    })
  );

  // Auto-pull bugs on workspace open if configured
  if (configManager.getAutoRefresh()) {
    configManager.hasCredentials().then((hasCredentials) => {
      if (hasCredentials) {
        vscode.commands.executeCommand('olivex.pullBugs');
      }
    });
  }
}

function setupAutoRefresh(configManager: ConfigManager, treeProvider: BugTreeProvider) {
  // Clear existing timer
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = undefined;
  }

  // Set up new timer if enabled
  if (configManager.getAutoRefresh()) {
    const intervalMs = configManager.getRefreshInterval() * 1000;
    autoRefreshTimer = setInterval(() => {
      configManager.hasCredentials().then((hasCredentials) => {
        if (hasCredentials) {
          vscode.commands.executeCommand('olivex.pullBugs');
        }
      });
    }, intervalMs);
  }
}

export function deactivate() {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
  }
  console.log('OliveX Security extension is now deactivated');
}
