import * as vscode from 'vscode';
import { ConfigManager } from './config/settings';
import { BugTreeProvider } from './providers/bugTreeView';
import { ClaudeCodeBridge } from './claude/code-integration';
import { ClaudeCodeCLIExecutor } from './claude/cli-executor';
import { registerConfigureCommand } from './commands/configure';
import { registerPullBugsCommand } from './commands/pullBugs';
import { registerFixBugCommand } from './commands/fixBug';
import { registerFixWithClaudeCommand } from './commands/fixWithClaude';
import { registerGenerateDocsCommand } from './commands/generateDocs';
import { registerWorkflowCommands } from './commands/runFullWorkflow';
import { registerBatchScanCommands } from './commands/batchScan';
import { registerMarkFixedCommand } from './commands/markFixed';
import { registerViewBugDetailCommand } from './commands/viewBugDetail';
import { registerOpenInBrowserCommand } from './commands/openInBrowser';
import { SessionManager } from './claude/session-manager';
import { getNotificationService, disposeNotificationService } from './services/notificationService';
import { getStatusBarService, disposeStatusBarService } from './services/statusBarService';
import { getAPISyncService } from './services/apiSyncService';

let autoRefreshTimer: NodeJS.Timeout | undefined;

export function activate(context: vscode.ExtensionContext) {
  console.log('OliveX Security extension is now active');

  // Initialize services
  const notificationService = getNotificationService();
  const statusBarService = getStatusBarService();

  // Initialize managers
  const configManager = new ConfigManager(context);
  const treeProvider = new BugTreeProvider();
  const apiSyncService = getAPISyncService(configManager);

  // Show status bar if enabled
  const showStatusBar = vscode.workspace.getConfiguration('olivex').get<boolean>('showStatusBar', true);
  if (showStatusBar) {
    statusBarService.setIdle('OliveX Security - Ready');
  }

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

  const cliExecutor = workspaceRoot
    ? new ClaudeCodeCLIExecutor(workspaceRoot)
    : null;

  const sessionManager = workspaceRoot
    ? new SessionManager(context, workspaceRoot)
    : null;

  // Register utility commands
  context.subscriptions.push(
    vscode.commands.registerCommand('olivex.showOutput', () => {
      notificationService.showOutput();
    }),
    vscode.commands.registerCommand('olivex.processSyncQueue', async () => {
      statusBarService.setSyncing();
      await apiSyncService.processSyncQueue();
      statusBarService.setIdle();
    })
  );

  // Register all commands
  registerConfigureCommand(context, configManager);
  registerPullBugsCommand(context, configManager, treeProvider);
  registerViewBugDetailCommand(context);
  registerOpenInBrowserCommand(context, configManager);
  registerMarkFixedCommand(context, configManager, treeProvider);

  if (claudeBridge && cliExecutor && sessionManager) {
    // Register legacy fix command (clipboard mode)
    registerFixBugCommand(context, claudeBridge);

    // Register new Claude Code CLI commands
    registerFixWithClaudeCommand(context, cliExecutor);
    registerGenerateDocsCommand(context, cliExecutor);
    registerWorkflowCommands(context, cliExecutor, sessionManager);
    registerBatchScanCommands(context, cliExecutor);

    // Add CLI executor and session manager to subscriptions for cleanup
    context.subscriptions.push({ dispose: () => cliExecutor.dispose() });
    context.subscriptions.push({ dispose: () => sessionManager.dispose() });
  } else {
    // Register dummy commands if no workspace
    const noWorkspaceHandler = async () => {
      const action = await vscode.window.showWarningMessage(
        '🛠️ This feature requires an open workspace folder. Please open a folder or workspace to use Claude Code integration.',
        'Open Folder',
        'Cancel'
      );

      if (action === 'Open Folder') {
        vscode.commands.executeCommand('vscode.openFolder');
      }
    };

    context.subscriptions.push(
      vscode.commands.registerCommand('olivex.fixBug', noWorkspaceHandler),
      vscode.commands.registerCommand('olivex.fixWithClaude', noWorkspaceHandler),
      vscode.commands.registerCommand('olivex.generateTests', noWorkspaceHandler),
      vscode.commands.registerCommand('olivex.scanSimilar', noWorkspaceHandler),
      vscode.commands.registerCommand('olivex.interactiveFix', noWorkspaceHandler),
      vscode.commands.registerCommand('olivex.generateDocs', noWorkspaceHandler),
      vscode.commands.registerCommand('olivex.runFullWorkflow', noWorkspaceHandler),
      vscode.commands.registerCommand('olivex.quickFix', noWorkspaceHandler),
      vscode.commands.registerCommand('olivex.cancelWorkflow', noWorkspaceHandler),
      vscode.commands.registerCommand('olivex.viewActiveWorkflows', noWorkspaceHandler),
      vscode.commands.registerCommand('olivex.fullSecurityAudit', noWorkspaceHandler),
      vscode.commands.registerCommand('olivex.quickSecurityScan', noWorkspaceHandler),
      vscode.commands.registerCommand('olivex.scanForVulnType', noWorkspaceHandler)
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

  // Dispose services
  disposeNotificationService();
  disposeStatusBarService();

  console.log('OliveX Security extension is now deactivated');
}
