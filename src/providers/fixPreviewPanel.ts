import * as vscode from 'vscode';
import { FixResult } from '../claude/cli-executor';
import { Bug } from '../types';

/**
 * Panel for previewing and accepting/rejecting fixes
 */
export class FixPreviewPanel {
  public static currentPanel: FixPreviewPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private onAcceptCallback?: (fix: FixResult) => Promise<void>;
  private onRejectCallback?: () => void;
  private currentFix?: FixResult;
  private currentBug?: Bug;

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this.panel = panel;

    // Handle messages from the webview
    this.panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'accept':
            if (this.currentFix && this.onAcceptCallback) {
              await this.onAcceptCallback(this.currentFix);
            }
            this.dispose();
            break;
          case 'reject':
            if (this.onRejectCallback) {
              this.onRejectCallback();
            }
            this.dispose();
            break;
          case 'openFile':
            if (message.filePath) {
              const doc = await vscode.workspace.openTextDocument(message.filePath);
              await vscode.window.showTextDocument(doc);
            }
            break;
          case 'copyCode':
            await vscode.env.clipboard.writeText(message.code);
            vscode.window.showInformationMessage('Code copied to clipboard');
            break;
        }
      },
      null,
      this.disposables
    );

    // Handle panel disposal
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  /**
   * Create or show the fix preview panel
   */
  public static createOrShow(
    extensionUri: vscode.Uri,
    bug: Bug,
    fix: FixResult,
    onAccept: (fix: FixResult) => Promise<void>,
    onReject: () => void
  ): FixPreviewPanel {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If we already have a panel, dispose it and create a new one
    if (FixPreviewPanel.currentPanel) {
      FixPreviewPanel.currentPanel.dispose();
    }

    const panel = vscode.window.createWebviewPanel(
      'olivexFixPreview',
      `Fix Preview: ${bug.title.substring(0, 30)}...`,
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    FixPreviewPanel.currentPanel = new FixPreviewPanel(panel, extensionUri);
    FixPreviewPanel.currentPanel.currentFix = fix;
    FixPreviewPanel.currentPanel.currentBug = bug;
    FixPreviewPanel.currentPanel.onAcceptCallback = onAccept;
    FixPreviewPanel.currentPanel.onRejectCallback = onReject;
    FixPreviewPanel.currentPanel.update(bug, fix);

    return FixPreviewPanel.currentPanel;
  }

  /**
   * Update the panel content
   */
  private update(bug: Bug, fix: FixResult): void {
    this.panel.webview.html = this.getHtmlContent(bug, fix);
  }

  /**
   * Generate HTML content for the panel
   */
  private getHtmlContent(bug: Bug, fix: FixResult): string {
    const escapeHtml = (text: string): string => {
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    };

    const severityColor = {
      critical: '#ef4444',
      high: '#f97316',
      medium: '#eab308',
      low: '#22c55e',
      info: '#3b82f6',
    }[(bug.severity || 'info').toLowerCase()] || '#6b7280';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Fix Preview</title>
  <style>
    :root {
      --bg-primary: var(--vscode-editor-background);
      --bg-secondary: var(--vscode-sideBar-background);
      --text-primary: var(--vscode-editor-foreground);
      --text-secondary: var(--vscode-descriptionForeground);
      --border-color: var(--vscode-panel-border);
      --accent-color: var(--vscode-button-background);
      --success-color: #22c55e;
      --danger-color: #ef4444;
      --warning-color: #eab308;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--text-primary);
      background: var(--bg-primary);
      padding: 20px;
      line-height: 1.6;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border-color);
    }

    .header-info h1 {
      font-size: 1.5em;
      margin-bottom: 8px;
    }

    .severity-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 4px;
      font-size: 0.85em;
      font-weight: 600;
      text-transform: uppercase;
      background: ${severityColor}20;
      color: ${severityColor};
      border: 1px solid ${severityColor};
    }

    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border-radius: 6px;
      font-weight: 600;
      background: var(--success-color)20;
      color: var(--success-color);
    }

    .status-badge::before {
      content: '✓';
    }

    .section {
      margin-bottom: 24px;
      padding: 16px;
      background: var(--bg-secondary);
      border-radius: 8px;
      border: 1px solid var(--border-color);
    }

    .section-title {
      font-size: 1.1em;
      font-weight: 600;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .section-title .icon {
      font-size: 1.2em;
    }

    .analysis-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 16px;
    }

    .analysis-item {
      padding: 12px;
      background: var(--bg-primary);
      border-radius: 6px;
    }

    .analysis-item h4 {
      font-size: 0.9em;
      color: var(--text-secondary);
      margin-bottom: 6px;
    }

    .code-block {
      position: relative;
      margin: 12px 0;
    }

    .code-block pre {
      background: #1e1e1e;
      color: #d4d4d4;
      padding: 16px;
      border-radius: 6px;
      overflow-x: auto;
      font-family: 'Fira Code', 'Consolas', monospace;
      font-size: 0.9em;
      line-height: 1.5;
    }

    .code-block .copy-btn {
      position: absolute;
      top: 8px;
      right: 8px;
      padding: 4px 8px;
      background: #333;
      color: #fff;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.8em;
    }

    .code-block .copy-btn:hover {
      background: #444;
    }

    .diff-view {
      font-family: 'Fira Code', 'Consolas', monospace;
      font-size: 0.9em;
    }

    .diff-line {
      padding: 2px 8px;
      white-space: pre-wrap;
    }

    .diff-line.removed {
      background: #ff000020;
      color: #ff6b6b;
    }

    .diff-line.removed::before {
      content: '- ';
      color: #ff6b6b;
    }

    .diff-line.added {
      background: #00ff0020;
      color: #69db7c;
    }

    .diff-line.added::before {
      content: '+ ';
      color: #69db7c;
    }

    .security-measures {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 12px;
    }

    .measure-tag {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 6px 12px;
      background: var(--success-color)15;
      color: var(--success-color);
      border-radius: 20px;
      font-size: 0.85em;
    }

    .measure-tag::before {
      content: '✓';
    }

    .verification-list {
      list-style: none;
    }

    .verification-list li {
      padding: 8px 0;
      padding-left: 24px;
      position: relative;
    }

    .verification-list li::before {
      content: '○';
      position: absolute;
      left: 0;
      color: var(--text-secondary);
    }

    .actions {
      display: flex;
      gap: 12px;
      margin-top: 24px;
      padding-top: 16px;
      border-top: 1px solid var(--border-color);
    }

    .btn {
      padding: 12px 24px;
      border: none;
      border-radius: 6px;
      font-size: 1em;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-primary {
      background: var(--success-color);
      color: white;
    }

    .btn-primary:hover {
      opacity: 0.9;
      transform: translateY(-1px);
    }

    .btn-secondary {
      background: var(--bg-secondary);
      color: var(--text-primary);
      border: 1px solid var(--border-color);
    }

    .btn-secondary:hover {
      background: var(--border-color);
    }

    .btn-danger {
      background: var(--danger-color);
      color: white;
    }

    .btn-danger:hover {
      opacity: 0.9;
    }

    .file-path {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 8px;
      background: var(--bg-primary);
      border-radius: 4px;
      font-family: monospace;
      font-size: 0.9em;
      cursor: pointer;
    }

    .file-path:hover {
      text-decoration: underline;
    }

    .recommendations {
      margin-top: 12px;
      padding-left: 20px;
    }

    .recommendations li {
      margin-bottom: 8px;
      color: var(--text-secondary);
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-info">
      <h1>🔧 Fix Preview</h1>
      <p style="color: var(--text-secondary); margin-top: 4px;">
        ${escapeHtml(bug.title)}
      </p>
      <span class="severity-badge" style="margin-top: 8px;">
        ${(bug.severity || 'Unknown').toUpperCase()}
      </span>
    </div>
    <div class="status-badge">
      Fix Generated
    </div>
  </div>

  <div class="section">
    <h3 class="section-title">
      <span class="icon">🔍</span>
      Vulnerability Analysis
    </h3>
    <div class="analysis-grid">
      <div class="analysis-item">
        <h4>Root Cause</h4>
        <p>${escapeHtml(fix.vulnerability_analysis?.root_cause || 'Not specified')}</p>
      </div>
      <div class="analysis-item">
        <h4>Attack Vector</h4>
        <p>${escapeHtml(fix.vulnerability_analysis?.attack_vector || 'Not specified')}</p>
      </div>
      ${fix.vulnerability_analysis?.impact_assessment ? `
      <div class="analysis-item">
        <h4>Impact Assessment</h4>
        <p>${escapeHtml(fix.vulnerability_analysis.impact_assessment)}</p>
      </div>
      ` : ''}
    </div>
  </div>

  <div class="section">
    <h3 class="section-title">
      <span class="icon">📁</span>
      File to Modify
    </h3>
    <span class="file-path" onclick="openFile('${escapeHtml(fix.fix?.file_path || '')}')">
      📄 ${escapeHtml(fix.fix?.file_path || 'Unknown')}
    </span>
  </div>

  ${fix.fix?.original_code ? `
  <div class="section">
    <h3 class="section-title">
      <span class="icon">❌</span>
      Original Code (Vulnerable)
    </h3>
    <div class="code-block">
      <pre><code>${escapeHtml(fix.fix.original_code)}</code></pre>
      <button class="copy-btn" onclick="copyCode(\`${escapeHtml(fix.fix.original_code).replace(/`/g, '\\`')}\`)">Copy</button>
    </div>
  </div>
  ` : ''}

  <div class="section">
    <h3 class="section-title">
      <span class="icon">✅</span>
      Fixed Code (Secure)
    </h3>
    <div class="code-block">
      <pre><code>${escapeHtml(fix.fix?.fixed_code || 'No code generated')}</code></pre>
      <button class="copy-btn" onclick="copyCode(\`${escapeHtml(fix.fix?.fixed_code || '').replace(/`/g, '\\`')}\`)">Copy</button>
    </div>
  </div>

  <div class="section">
    <h3 class="section-title">
      <span class="icon">💡</span>
      Explanation
    </h3>
    <p>${escapeHtml(fix.fix?.explanation || 'No explanation provided')}</p>

    ${fix.fix?.security_measures_added?.length ? `
    <div class="security-measures">
      ${fix.fix.security_measures_added.map(m => `<span class="measure-tag">${escapeHtml(m)}</span>`).join('')}
    </div>
    ` : ''}
  </div>

  ${fix.verification_steps?.length ? `
  <div class="section">
    <h3 class="section-title">
      <span class="icon">✔️</span>
      Verification Steps
    </h3>
    <ul class="verification-list">
      ${fix.verification_steps.map(step => `<li>${escapeHtml(step)}</li>`).join('')}
    </ul>
  </div>
  ` : ''}

  ${fix.additional_recommendations?.length ? `
  <div class="section">
    <h3 class="section-title">
      <span class="icon">📋</span>
      Additional Recommendations
    </h3>
    <ul class="recommendations">
      ${fix.additional_recommendations.map(rec => `<li>${escapeHtml(rec)}</li>`).join('')}
    </ul>
  </div>
  ` : ''}

  <div class="actions">
    <button class="btn btn-primary" onclick="acceptFix()">
      ✅ Accept & Apply Fix
    </button>
    <button class="btn btn-secondary" onclick="copyCode(\`${escapeHtml(fix.fix?.fixed_code || '').replace(/`/g, '\\`')}\`)">
      📋 Copy Code Only
    </button>
    <button class="btn btn-danger" onclick="rejectFix()">
      ❌ Reject
    </button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    function acceptFix() {
      vscode.postMessage({ command: 'accept' });
    }

    function rejectFix() {
      vscode.postMessage({ command: 'reject' });
    }

    function openFile(filePath) {
      vscode.postMessage({ command: 'openFile', filePath });
    }

    function copyCode(code) {
      vscode.postMessage({ command: 'copyCode', code });
    }
  </script>
</body>
</html>`;
  }

  /**
   * Dispose of the panel
   */
  public dispose(): void {
    FixPreviewPanel.currentPanel = undefined;

    this.panel.dispose();

    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}
