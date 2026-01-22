import * as vscode from 'vscode';
import { ClaudeCodeCLIExecutor } from '../claude/cli-executor';
import { SessionManager, WorkflowStepType } from '../claude/session-manager';
import { WorkflowProgressPanel } from '../providers/workflowProgressPanel';
import { BugItem } from '../providers/bugTreeView';
import { Bug } from '../types';

/**
 * Available workflow presets
 */
export type WorkflowPreset = 'full' | 'fix-only' | 'scan-fix' | 'fix-test' | 'fix-doc';

/**
 * Workflow preset configurations
 */
const WORKFLOW_PRESETS: Record<WorkflowPreset, { label: string; steps: WorkflowStepType[]; description: string }> = {
  'full': {
    label: 'Full Pipeline',
    steps: ['scan', 'fix', 'test', 'document'],
    description: 'Scan → Fix → Test → Document',
  },
  'fix-only': {
    label: 'Fix Only',
    steps: ['fix'],
    description: 'Just fix the vulnerability',
  },
  'scan-fix': {
    label: 'Scan & Fix',
    steps: ['scan', 'fix'],
    description: 'Scan codebase then fix',
  },
  'fix-test': {
    label: 'Fix & Test',
    steps: ['fix', 'test'],
    description: 'Fix then generate tests',
  },
  'fix-doc': {
    label: 'Fix & Document',
    steps: ['fix', 'document'],
    description: 'Fix then generate documentation',
  },
};

/**
 * Register the runFullWorkflow and related commands
 */
export async function registerWorkflowCommands(
  context: vscode.ExtensionContext,
  cliExecutor: ClaudeCodeCLIExecutor,
  sessionManager: SessionManager
): Promise<void> {
  // Main workflow command
  context.subscriptions.push(
    vscode.commands.registerCommand('olivex.runFullWorkflow', async (item?: BugItem | Bug) => {
      if (!item) {
        vscode.window.showErrorMessage('No bug selected. Please select a bug from the tree view.');
        return;
      }
      const bug: Bug = 'bug' in item ? item.bug : item;

      if (!bug) {
        vscode.window.showErrorMessage('No bug selected');
        return;
      }

      // Check if Claude CLI is installed
      const isInstalled = await cliExecutor.isClaudeInstalled();
      if (!isInstalled) {
        const action = await vscode.window.showErrorMessage(
          'Claude Code CLI is not installed.',
          'Install Instructions',
          'Cancel'
        );

        if (action === 'Install Instructions') {
          vscode.env.openExternal(vscode.Uri.parse('https://claude.ai/code'));
        }
        return;
      }

      // Let user select workflow preset
      const presetItems = Object.entries(WORKFLOW_PRESETS).map(([key, value]) => ({
        label: value.label,
        description: value.description,
        value: key as WorkflowPreset,
      }));

      const selectedPreset = await vscode.window.showQuickPick(presetItems, {
        placeHolder: 'Select workflow type',
        title: 'Security Workflow',
      });

      if (!selectedPreset) {
        return;
      }

      const preset = WORKFLOW_PRESETS[selectedPreset.value];

      // Create session and show progress panel
      const session = sessionManager.createSession(bug, preset.steps);
      const progressPanel = WorkflowProgressPanel.createOrShow(context.extensionUri, session);

      // Subscribe to state changes
      const stateChangeDisposable = sessionManager.onStateChange((event) => {
        progressPanel.updateSession(event.session);
        progressPanel.handleStateChange(event);
      });

      try {
        // Execute the workflow
        const completedSession = await sessionManager.executeWorkflow(
          bug,
          cliExecutor,
          preset.steps,
          (step, progress, message) => {
            // Progress is handled via state change events
          }
        );

        // Show completion message
        if (completedSession.status === 'completed') {
          const viewResults = await vscode.window.showInformationMessage(
            `Workflow completed successfully for: ${bug.title}`,
            'View Results',
            'Close'
          );

          if (viewResults === 'View Results') {
            // Show the results in a new document
            const results = {
              session_id: completedSession.id,
              bug: {
                id: bug.id,
                title: bug.title,
                severity: bug.severity,
              },
              steps: completedSession.steps.map((s) => ({
                name: s.name,
                status: s.status,
                result: s.result,
                duration: s.startedAt && s.completedAt
                  ? new Date(s.completedAt).getTime() - new Date(s.startedAt).getTime()
                  : null,
              })),
              completed_at: completedSession.updatedAt,
            };

            const doc = await vscode.workspace.openTextDocument({
              content: JSON.stringify(results, null, 2),
              language: 'json',
            });
            await vscode.window.showTextDocument(doc, vscode.ViewColumn.Three);
          }
        }

      } catch (error: any) {
        vscode.window.showErrorMessage(`Workflow failed: ${error.message}`);
      } finally {
        stateChangeDisposable.dispose();
      }
    })
  );

  // Cancel workflow command
  context.subscriptions.push(
    vscode.commands.registerCommand('olivex.cancelWorkflow', async (sessionId: string) => {
      if (!sessionId) {
        vscode.window.showWarningMessage('No active workflow to cancel');
        return;
      }

      const confirm = await vscode.window.showWarningMessage(
        'Are you sure you want to cancel the workflow?',
        'Yes, Cancel',
        'No'
      );

      if (confirm === 'Yes, Cancel') {
        sessionManager.cancelSession(sessionId);
        vscode.window.showInformationMessage('Workflow cancelled');
      }
    })
  );

  // Retry failed step command
  context.subscriptions.push(
    vscode.commands.registerCommand('olivex.retryWorkflowStep', async (sessionId: string, stepIndex: number) => {
      if (!sessionId) {
        vscode.window.showWarningMessage('No session specified');
        return;
      }

      const session = sessionManager.getSession(sessionId);
      if (!session) {
        vscode.window.showErrorMessage('Session not found');
        return;
      }

      vscode.window.showInformationMessage('Retry functionality coming soon');
      // TODO: Implement retry logic
    })
  );

  // View active workflows command
  context.subscriptions.push(
    vscode.commands.registerCommand('olivex.viewActiveWorkflows', async () => {
      const activeSessions = sessionManager.getActiveSessions();

      if (activeSessions.length === 0) {
        vscode.window.showInformationMessage('No active workflows');
        return;
      }

      const items = activeSessions.map((s) => ({
        label: s.bugTitle,
        description: `Step ${s.currentStepIndex + 1}/${s.steps.length} - ${s.steps[s.currentStepIndex]?.name || 'N/A'}`,
        session: s,
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a workflow to view',
      });

      if (selected) {
        WorkflowProgressPanel.createOrShow(context.extensionUri, selected.session);
      }
    })
  );

  // Quick fix command (fix-only preset)
  context.subscriptions.push(
    vscode.commands.registerCommand('olivex.quickFix', async (item?: BugItem | Bug) => {
      if (!item) {
        vscode.window.showErrorMessage('No bug selected. Please select a bug from the tree view.');
        return;
      }
      const bug: Bug = 'bug' in item ? item.bug : item;

      if (!bug) {
        vscode.window.showErrorMessage('No bug selected');
        return;
      }

      // Directly run fix-only workflow
      const session = sessionManager.createSession(bug, ['fix']);
      const progressPanel = WorkflowProgressPanel.createOrShow(context.extensionUri, session);

      const stateChangeDisposable = sessionManager.onStateChange((event) => {
        progressPanel.updateSession(event.session);
        progressPanel.handleStateChange(event);
      });

      try {
        await sessionManager.executeWorkflow(bug, cliExecutor, ['fix']);
      } catch (error: any) {
        vscode.window.showErrorMessage(`Quick fix failed: ${error.message}`);
      } finally {
        stateChangeDisposable.dispose();
      }
    })
  );
}
