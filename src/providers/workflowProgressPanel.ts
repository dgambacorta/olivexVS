import * as vscode from 'vscode';
import { WorkflowSession, WorkflowStep, WorkflowStepType, WorkflowStateChangeEvent } from '../claude/session-manager';

/**
 * WebView panel showing multi-step workflow progress
 */
export class WorkflowProgressPanel {
  public static currentPanel: WorkflowProgressPanel | undefined;
  private static readonly viewType = 'olivexWorkflowProgress';

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _session: WorkflowSession | null = null;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(
    extensionUri: vscode.Uri,
    session: WorkflowSession
  ): WorkflowProgressPanel {
    const column = vscode.ViewColumn.Two;

    if (WorkflowProgressPanel.currentPanel) {
      WorkflowProgressPanel.currentPanel._session = session;
      WorkflowProgressPanel.currentPanel._update();
      WorkflowProgressPanel.currentPanel._panel.reveal(column);
      return WorkflowProgressPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      WorkflowProgressPanel.viewType,
      'Workflow Progress',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      }
    );

    WorkflowProgressPanel.currentPanel = new WorkflowProgressPanel(panel, extensionUri, session);
    return WorkflowProgressPanel.currentPanel;
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    session: WorkflowSession
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._session = session;

    this._update();

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'cancel':
            vscode.commands.executeCommand('olivex.cancelWorkflow', this._session?.id);
            break;
          case 'viewStepResult':
            this._viewStepResult(message.stepIndex);
            break;
          case 'retryStep':
            vscode.commands.executeCommand('olivex.retryWorkflowStep', this._session?.id, message.stepIndex);
            break;
        }
      },
      null,
      this._disposables
    );
  }

  /**
   * Update the panel with new session state
   */
  public updateSession(session: WorkflowSession): void {
    this._session = session;
    this._update();
  }

  /**
   * Handle workflow state change events
   */
  public handleStateChange(event: WorkflowStateChangeEvent): void {
    this._session = event.session;
    this._update();

    // Show notification for important events
    switch (event.type) {
      case 'completed':
        vscode.window.showInformationMessage('Workflow completed successfully!');
        break;
      case 'failed':
        vscode.window.showErrorMessage(`Workflow failed: ${event.step?.error || 'Unknown error'}`);
        break;
      case 'step_completed':
        // Could show toast for each step if desired
        break;
    }
  }

  private _viewStepResult(stepIndex: number): void {
    if (!this._session) return;

    const step = this._session.steps[stepIndex];
    if (!step || !step.result) {
      vscode.window.showWarningMessage('No result available for this step');
      return;
    }

    // Open the result in a new document
    vscode.workspace.openTextDocument({
      content: JSON.stringify(step.result, null, 2),
      language: 'json',
    }).then((doc) => {
      vscode.window.showTextDocument(doc, vscode.ViewColumn.Three);
    });
  }

  private _update(): void {
    this._panel.title = this._session
      ? `Workflow: ${this._session.bugTitle.substring(0, 30)}...`
      : 'Workflow Progress';
    this._panel.webview.html = this._getHtmlForWebview();
  }

  private _getHtmlForWebview(): string {
    if (!this._session) {
      return this._getEmptyHtml();
    }

    const session = this._session;
    const stepsHtml = session.steps.map((step, index) => this._getStepHtml(step, index)).join('');
    const overallProgress = this._calculateProgress(session);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Workflow Progress</title>
  <style>
    :root {
      --vscode-font: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, sans-serif);
    }

    * {
      box-sizing: border-box;
    }

    body {
      font-family: var(--vscode-font);
      padding: 20px;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      line-height: 1.5;
    }

    .header {
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--vscode-widget-border);
    }

    .header h1 {
      margin: 0 0 8px 0;
      font-size: 20px;
      font-weight: 600;
    }

    .header .bug-title {
      font-size: 14px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 12px;
    }

    .status-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 500;
      text-transform: uppercase;
    }

    .status-pending { background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
    .status-in_progress { background: #0078d4; color: white; }
    .status-completed { background: #107c10; color: white; }
    .status-failed { background: #d13438; color: white; }
    .status-cancelled { background: #797775; color: white; }

    .progress-container {
      margin-bottom: 24px;
    }

    .progress-bar {
      height: 8px;
      background: var(--vscode-progressBar-background);
      border-radius: 4px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: var(--vscode-progressBar-background);
      transition: width 0.3s ease;
    }

    .progress-fill.in_progress { background: #0078d4; }
    .progress-fill.completed { background: #107c10; }
    .progress-fill.failed { background: #d13438; }

    .progress-text {
      margin-top: 8px;
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }

    .steps-container {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .step {
      display: flex;
      align-items: flex-start;
      gap: 16px;
      padding: 16px;
      background: var(--vscode-editor-inactiveSelectionBackground);
      border-radius: 8px;
      border-left: 4px solid transparent;
    }

    .step.pending { border-left-color: var(--vscode-badge-background); }
    .step.in_progress { border-left-color: #0078d4; }
    .step.completed { border-left-color: #107c10; }
    .step.failed { border-left-color: #d13438; }
    .step.skipped { border-left-color: #797775; opacity: 0.7; }

    .step-icon {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      flex-shrink: 0;
    }

    .step.pending .step-icon { background: var(--vscode-badge-background); }
    .step.in_progress .step-icon { background: #0078d4; }
    .step.completed .step-icon { background: #107c10; }
    .step.failed .step-icon { background: #d13438; }
    .step.skipped .step-icon { background: #797775; }

    .step-content {
      flex: 1;
    }

    .step-name {
      font-weight: 600;
      font-size: 14px;
      margin-bottom: 4px;
      text-transform: capitalize;
    }

    .step-description {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }

    .step-time {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      margin-top: 8px;
    }

    .step-error {
      color: #d13438;
      font-size: 12px;
      margin-top: 8px;
      padding: 8px;
      background: rgba(209, 52, 56, 0.1);
      border-radius: 4px;
    }

    .step-actions {
      margin-top: 12px;
      display: flex;
      gap: 8px;
    }

    .btn {
      padding: 6px 12px;
      border: none;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }

    .btn:hover {
      background: var(--vscode-button-hoverBackground);
    }

    .btn-secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }

    .btn-secondary:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }

    .btn-danger {
      background: #d13438;
      color: white;
    }

    .spinner {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 2px solid transparent;
      border-top-color: currentColor;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .actions {
      margin-top: 24px;
      padding-top: 16px;
      border-top: 1px solid var(--vscode-widget-border);
      display: flex;
      gap: 12px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Security Workflow</h1>
    <div class="bug-title">${this._escapeHtml(session.bugTitle)}</div>
    <span class="status-badge status-${session.status}">${session.status.replace('_', ' ')}</span>
  </div>

  <div class="progress-container">
    <div class="progress-bar">
      <div class="progress-fill ${session.status}" style="width: ${overallProgress}%"></div>
    </div>
    <div class="progress-text">${Math.round(overallProgress)}% complete</div>
  </div>

  <div class="steps-container">
    ${stepsHtml}
  </div>

  <div class="actions">
    ${session.status === 'in_progress' ? `
      <button class="btn btn-danger" onclick="cancel()">Cancel Workflow</button>
    ` : ''}
    ${session.status === 'failed' ? `
      <button class="btn" onclick="retry()">Retry Failed Step</button>
    ` : ''}
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    function cancel() {
      vscode.postMessage({ command: 'cancel' });
    }

    function viewResult(stepIndex) {
      vscode.postMessage({ command: 'viewStepResult', stepIndex });
    }

    function retry() {
      const failedIndex = ${session.steps.findIndex(s => s.status === 'failed')};
      if (failedIndex >= 0) {
        vscode.postMessage({ command: 'retryStep', stepIndex: failedIndex });
      }
    }
  </script>
</body>
</html>`;
  }

  private _getStepHtml(step: WorkflowStep, index: number): string {
    const icons: Record<WorkflowStepType, string> = {
      scan: '🔍',
      fix: '🔧',
      test: '🧪',
      document: '📄',
    };

    const descriptions: Record<WorkflowStepType, string> = {
      scan: 'Scanning codebase for similar vulnerabilities',
      fix: 'Analyzing and fixing the vulnerability',
      test: 'Generating security test cases',
      document: 'Creating documentation for the fix',
    };

    const statusIcons: Record<string, string> = {
      pending: '○',
      in_progress: '◐',
      completed: '✓',
      failed: '✗',
      skipped: '−',
    };

    const timeInfo = this._getTimeInfo(step);

    return `
      <div class="step ${step.status}">
        <div class="step-icon">${step.status === 'in_progress' ? '<span class="spinner"></span>' : statusIcons[step.status]}</div>
        <div class="step-content">
          <div class="step-name">${icons[step.name]} ${step.name}</div>
          <div class="step-description">${descriptions[step.name]}</div>
          ${timeInfo ? `<div class="step-time">${timeInfo}</div>` : ''}
          ${step.error ? `<div class="step-error">${this._escapeHtml(step.error)}</div>` : ''}
          ${step.status === 'completed' && step.result ? `
            <div class="step-actions">
              <button class="btn btn-secondary" onclick="viewResult(${index})">View Result</button>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  private _getTimeInfo(step: WorkflowStep): string {
    if (step.status === 'pending') return '';

    if (step.startedAt && step.completedAt) {
      const duration = new Date(step.completedAt).getTime() - new Date(step.startedAt).getTime();
      return `Completed in ${this._formatDuration(duration)}`;
    }

    if (step.startedAt) {
      const elapsed = Date.now() - new Date(step.startedAt).getTime();
      return `Running for ${this._formatDuration(elapsed)}...`;
    }

    return '';
  }

  private _formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }

  private _calculateProgress(session: WorkflowSession): number {
    const total = session.steps.length;
    const completed = session.steps.filter(s => s.status === 'completed' || s.status === 'skipped').length;
    const inProgress = session.steps.filter(s => s.status === 'in_progress').length;
    return ((completed + inProgress * 0.5) / total) * 100;
  }

  private _getEmptyHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Workflow Progress</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      padding: 40px;
      text-align: center;
      color: var(--vscode-descriptionForeground);
    }
  </style>
</head>
<body>
  <p>No workflow session active</p>
</body>
</html>`;
  }

  private _escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  public dispose(): void {
    WorkflowProgressPanel.currentPanel = undefined;
    this._panel.dispose();

    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }
}
