import * as vscode from 'vscode';
import { Bug, BugSeverity } from '../types';

export class BugDetailPanel {
  public static currentPanel: BugDetailPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel, private extensionUri: vscode.Uri) {
    this._panel = panel;

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      message => {
        switch (message.command) {
          case 'fixBug':
            vscode.commands.executeCommand('olivex.fixBug', { bug: message.bug });
            break;
          case 'markFixed':
            vscode.commands.executeCommand('olivex.markFixed', { bug: message.bug });
            break;
          case 'openInBrowser':
            vscode.commands.executeCommand('olivex.openInBrowser', { bug: message.bug });
            break;
        }
      },
      null,
      this._disposables
    );

    // Clean up when panel is closed
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  public static show(bug: Bug, extensionUri: vscode.Uri) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If we already have a panel, show it
    if (BugDetailPanel.currentPanel) {
      BugDetailPanel.currentPanel._panel.reveal(column);
      BugDetailPanel.currentPanel.update(bug);
      return;
    }

    // Create new panel
    const panel = vscode.window.createWebviewPanel(
      'olivexBugDetail',
      'Bug Details',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'resources')],
      }
    );

    BugDetailPanel.currentPanel = new BugDetailPanel(panel, extensionUri);
    BugDetailPanel.currentPanel.update(bug);
  }

  public update(bug: Bug) {
    this._panel.title = `Bug: ${bug.title}`;
    this._panel.webview.html = this._getHtmlForWebview(bug);
    // Send bug data safely via postMessage instead of inline JSON
    this._panel.webview.postMessage({ type: 'bugData', bug: bug });
  }

  public dispose() {
    BugDetailPanel.currentPanel = undefined;

    this._panel.dispose();

    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  private _getHtmlForWebview(bug: Bug): string {
    const severityColor = this._getSeverityColor(bug.severity || 'low');
    const severityBadge = this._getSeverityBadge(bug.severity || 'low');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bug Details</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            line-height: 1.6;
        }
        .header {
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 20px;
            margin-bottom: 20px;
        }
        .title {
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 10px;
        }
        .metadata {
            display: flex;
            gap: 15px;
            flex-wrap: wrap;
            margin-bottom: 10px;
        }
        .badge {
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
        }
        .severity-${bug.severity} {
            background-color: ${severityColor};
            color: white;
        }
        .status-badge {
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
        }
        .section {
            margin-bottom: 25px;
        }
        .section-title {
            font-size: 16px;
            font-weight: bold;
            margin-bottom: 10px;
            color: var(--vscode-foreground);
        }
        .content {
            line-height: 1.6;
            white-space: pre-wrap;
        }
        .code-block {
            background-color: var(--vscode-textCodeBlock-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 12px;
            overflow-x: auto;
            font-family: var(--vscode-editor-font-family);
            font-size: var(--vscode-editor-font-size);
        }
        .info-grid {
            display: grid;
            grid-template-columns: 150px 1fr;
            gap: 10px;
            margin-bottom: 20px;
        }
        .info-label {
            font-weight: bold;
            color: var(--vscode-descriptionForeground);
        }
        .actions {
            display: flex;
            gap: 10px;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid var(--vscode-panel-border);
        }
        button {
            padding: 8px 16px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: opacity 0.2s;
        }
        button:hover {
            opacity: 0.8;
        }
        .primary-button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        .secondary-button {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        .tag {
            display: inline-block;
            padding: 2px 8px;
            margin-right: 5px;
            margin-bottom: 5px;
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            border-radius: 4px;
            font-size: 12px;
        }
        
        /* AI Insights Styles */
        .ai-section {
            background: linear-gradient(135deg, rgba(156, 39, 176, 0.1) 0%, rgba(103, 58, 183, 0.1) 100%);
            border-left: 4px solid #9c27b0;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 25px;
            position: relative;
        }
        .ai-section::before {
            content: '🤖';
            position: absolute;
            top: 20px;
            right: 20px;
            font-size: 24px;
            opacity: 0.3;
        }
        .ai-section-header {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 15px;
        }
        .ai-badge {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .ai-title {
            font-size: 18px;
            font-weight: 600;
            color: var(--vscode-foreground);
        }
        .ai-content {
            background-color: rgba(0, 0, 0, 0.2);
            border-radius: 6px;
            padding: 15px;
            line-height: 1.7;
            margin-top: 10px;
        }
        .dev-explanation {
            border-left-color: #2196f3;
            background: linear-gradient(135deg, rgba(33, 150, 243, 0.1) 0%, rgba(3, 169, 244, 0.1) 100%);
        }
        .dev-explanation::before {
            content: '👨‍💻';
        }
        .solution-prompt {
            border-left-color: #4caf50;
            background: linear-gradient(135deg, rgba(76, 175, 80, 0.1) 0%, rgba(139, 195, 74, 0.1) 100%);
        }
        .solution-prompt::before {
            content: '💡';
        }
        .collapsible {
            cursor: pointer;
            user-select: none;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .collapsible::after {
            content: '▼';
            font-size: 12px;
            transition: transform 0.3s ease;
        }
        .collapsible.collapsed::after {
            transform: rotate(-90deg);
        }
        .collapsible-content {
            max-height: 1000px;
            overflow: hidden;
            transition: max-height 0.3s ease, opacity 0.3s ease;
            opacity: 1;
        }
        .collapsible-content.collapsed {
            max-height: 0;
            opacity: 0;
        }
        
        .markdown-content h1,
        .markdown-content h2,
        .markdown-content h3 {
            margin-top: 16px;
            margin-bottom: 8px;
            font-weight: 600;
        }
        .markdown-content h1 { font-size: 20px; }
        .markdown-content h2 { font-size: 18px; }
        .markdown-content h3 { font-size: 16px; }
        .markdown-content p {
            margin-bottom: 12px;
        }
        .markdown-content code {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 2px 6px;
            border-radius: 3px;
            font-family: var(--vscode-editor-font-family);
            font-size: 0.9em;
        }
        .markdown-content pre {
            background-color: var(--vscode-textCodeBlock-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 12px;
            overflow-x: auto;
            margin: 12px 0;
        }
        .markdown-content pre code {
            background-color: transparent;
            padding: 0;
        }
        .markdown-content ul,
        .markdown-content ol {
            margin-left: 20px;
            margin-bottom: 12px;
        }
        .markdown-content li {
            margin-bottom: 4px;
        }
        .markdown-content hr {
            border: none;
            border-top: 1px solid var(--vscode-panel-border);
            margin: 16px 0;
        }
        .markdown-content blockquote {
            border-left: 3px solid var(--vscode-panel-border);
            padding-left: 12px;
            margin: 12px 0;
            color: var(--vscode-descriptionForeground);
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="title">${this._escapeHtml(bug.title)}</div>
        <div class="metadata">
            <span class="badge severity-${bug.severity}">${severityBadge} ${bug.severity}</span>
            <span class="badge status-badge">${bug.status}</span>
            ${bug.cvssScore ? `<span class="badge status-badge">CVSS ${bug.cvssScore}</span>` : ''}
            ${bug.cweId ? `<span class="badge status-badge">${bug.cweId}</span>` : ''}
        </div>
    </div>

    <div class="info-grid">
        <div class="info-label">Bug ID:</div>
        <div>${bug.id}</div>
        
        ${bug.reportedBy ? `
        <div class="info-label">Reported By:</div>
        <div>${this._escapeHtml(bug.reportedBy)}</div>
        ` : ''}
        
        <div class="info-label">Reported At:</div>
        <div>${bug.created_at ? new Date(bug.created_at).toLocaleString() : 'Unknown'}</div>
        
        ${bug.program_title ? `
        <div class="info-label">Program:</div>
        <div>${this._escapeHtml(bug.program_title)}</div>
        ` : ''}
        
        ${bug.affectedFile ? `
        <div class="info-label">Affected File:</div>
        <div><code>${this._escapeHtml(bug.affectedFile)}</code></div>
        ` : ''}
        
        ${bug.affectedLines ? `
        <div class="info-label">Affected Lines:</div>
        <div>Lines ${bug.affectedLines[0]}-${bug.affectedLines[1]}</div>
        ` : ''}
        
        ${bug.target_url ? `
        <div class="info-label">Affected URL:</div>
        <div><code>${this._escapeHtml(bug.target_url)}</code></div>
        ` : ''}
    </div>

    ${bug.tags && typeof bug.tags === 'string' ? `
    <div class="section">
        <div class="section-title">Tags</div>
        <div>
            <span class="tag">${this._escapeHtml(bug.tags)}</span>
        </div>
    </div>
    ` : ''}

    ${bug.dev_explanation ? `
    <div class="ai-section dev-explanation">
        <div class="ai-section-header collapsible" onclick="toggleSection(this)">
            <div style="display: flex; align-items: center; gap: 10px;">
                <span class="ai-badge">AI Insights</span>
                <span class="ai-title">Developer Explanation</span>
            </div>
        </div>
        <div class="collapsible-content">
            <div class="ai-content markdown-content">${this._markdownToHtml(bug.dev_explanation)}</div>
        </div>
    </div>
    ` : ''}

    ${bug.solution_prompt ? `
    <div class="ai-section solution-prompt">
        <div class="ai-section-header collapsible" onclick="toggleSection(this)">
            <div style="display: flex; align-items: center; gap: 10px;">
                <span class="ai-badge">Fix Guide</span>
                <span class="ai-title">Solution Prompt</span>
            </div>
        </div>
        <div class="collapsible-content">
            <div class="ai-content markdown-content">${this._markdownToHtml(bug.solution_prompt)}</div>
        </div>
    </div>
    ` : ''}

    <div class="section">
        <div class="section-title">Description</div>
        <div class="content markdown-content">${this._markdownToHtml(bug.description)}</div>
    </div>

    ${bug.impact ? `
    <div class="section">
        <div class="section-title">Impact</div>
        <div class="content markdown-content">${this._markdownToHtml(bug.impact)}</div>
    </div>
    ` : ''}

    ${bug.proofOfConcept ? `
    <div class="section">
        <div class="section-title">Proof of Concept</div>
        <div class="code-block">${this._escapeHtml(bug.proofOfConcept)}</div>
    </div>
    ` : ''}

    ${bug.recommendation ? `
    <div class="section">
        <div class="section-title">Recommended Fix</div>
        <div class="content">${this._escapeHtml(bug.recommendation)}</div>
    </div>
    ` : ''}

    <div class="actions">
        <button class="primary-button" onclick="fixBug()">🛠️ Fix with AI</button>
        <button class="secondary-button" onclick="markFixed()">✅ Mark as Fixed</button>
        <button class="secondary-button" onclick="openInBrowser()">🔗 Open in 0xHunter</button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let bug = null;
        
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'bugData') {
                bug = message.bug;
            }
        });

        function toggleSection(header) {
            header.classList.toggle('collapsed');
            const content = header.nextElementSibling;
            content.classList.toggle('collapsed');
        }

        function fixBug() {
            vscode.postMessage({
                command: 'fixBug',
                bug: bug
            });
        }

        function markFixed() {
            vscode.postMessage({
                command: 'markFixed',
                bug: bug
            });
        }

        function openInBrowser() {
            vscode.postMessage({
                command: 'openInBrowser',
                bug: bug
            });
        }
    </script>
</body>
</html>`;
  }

  private _getSeverityColor(severity: string): string {
    const colorMap: Record<string, string> = {
      'critical': '#d32f2f',
      'high': '#f57c00',
      'medium': '#fbc02d',
      'low': '#388e3c',
      'info': '#1976d2',
    };
    return colorMap[severity.toLowerCase()] || '#1976d2';
  }

  private _getSeverityBadge(severity: string): string {
    const badgeMap: Record<string, string> = {
      'critical': '🔴',
      'high': '🟠',
      'medium': '🟡',
      'low': '🟢',
      'info': '🔵',
    };
    return badgeMap[severity.toLowerCase()] || '🔵';
  }

  private _markdownToHtml(markdown: string): string {
    if (!markdown) return '';
    
    let html = this._escapeHtml(markdown);
    
    // Headers
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    
    // Code blocks (``` code ```)
    html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    
    // Inline code (`code`)
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Bold (**text**)
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    
    // Italic (*text*)
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    
    // Horizontal rule (---)
    html = html.replace(/^---$/gm, '<hr>');
    
    // Line breaks (\r\n to <br>)
    html = html.replace(/\r\n/g, '<br>');
    html = html.replace(/\n/g, '<br>');
    
    // Links [text](url)
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    
    // Unordered lists
    html = html.replace(/^[*-] (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
    
    return html;
  }

  private _escapeHtml(text: string): string {
    const div = text.replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
    return div;
  }
}
