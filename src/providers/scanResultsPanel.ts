import * as vscode from 'vscode';

/**
 * Scan finding structure
 */
export interface ScanFinding {
  id: string;
  vulnerability_type: string;
  file_path: string;
  line_numbers: number[];
  code_snippet: string;
  risk_level: 'critical' | 'high' | 'medium' | 'low' | 'info';
  confidence: 'high' | 'medium' | 'low';
  similarity_score?: number;
  matched_pattern?: string;
  context?: string;
  recommendation: string;
  cwe_id?: string;
}

/**
 * Scan results structure
 */
export interface ScanResults {
  scan_summary: {
    files_scanned: number;
    total_findings: number;
    patterns_checked: string[];
    scan_duration_ms?: number;
  };
  similar_vulnerabilities: ScanFinding[];
  files_with_issues?: {
    path: string;
    findings_count: number;
    severity_summary: Record<string, number>;
  }[];
  recommendations?: string[];
}

/**
 * WebView panel showing scan results with navigation
 */
export class ScanResultsPanel {
  public static currentPanel: ScanResultsPanel | undefined;
  private static readonly viewType = 'olivexScanResults';

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _results: ScanResults | null = null;
  private _bugTitle: string = '';
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(
    extensionUri: vscode.Uri,
    results: ScanResults,
    bugTitle: string
  ): ScanResultsPanel {
    const column = vscode.ViewColumn.Two;

    if (ScanResultsPanel.currentPanel) {
      ScanResultsPanel.currentPanel._results = results;
      ScanResultsPanel.currentPanel._bugTitle = bugTitle;
      ScanResultsPanel.currentPanel._update();
      ScanResultsPanel.currentPanel._panel.reveal(column);
      return ScanResultsPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      ScanResultsPanel.viewType,
      'Scan Results',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      }
    );

    ScanResultsPanel.currentPanel = new ScanResultsPanel(panel, extensionUri, results, bugTitle);
    return ScanResultsPanel.currentPanel;
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    results: ScanResults,
    bugTitle: string
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._results = results;
    this._bugTitle = bugTitle;

    this._update();

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'navigateToFinding':
            await this._navigateToFinding(message.finding);
            break;
          case 'fixFinding':
            await this._fixFinding(message.finding);
            break;
          case 'exportResults':
            await this._exportResults(message.format);
            break;
          case 'createBugReport':
            await this._createBugReport(message.finding);
            break;
        }
      },
      null,
      this._disposables
    );
  }

  private async _navigateToFinding(finding: ScanFinding): Promise<void> {
    try {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) return;

      const filePath = vscode.Uri.joinPath(workspaceFolders[0].uri, finding.file_path);
      const doc = await vscode.workspace.openTextDocument(filePath);
      const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);

      // Navigate to the line
      const line = finding.line_numbers[0] - 1;
      const range = new vscode.Range(line, 0, line, 0);
      editor.selection = new vscode.Selection(range.start, range.end);
      editor.revealRange(range, vscode.TextEditorRevealType.InCenter);

      // Highlight the affected lines
      const decoration = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(255, 0, 0, 0.2)',
        border: '1px solid rgba(255, 0, 0, 0.5)',
        isWholeLine: true,
      });

      const startLine = finding.line_numbers[0] - 1;
      const endLine = finding.line_numbers[finding.line_numbers.length - 1] - 1;
      const decorationRange = new vscode.Range(startLine, 0, endLine, 0);
      editor.setDecorations(decoration, [decorationRange]);

      // Remove decoration after 3 seconds
      setTimeout(() => decoration.dispose(), 3000);

    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to open file: ${error.message}`);
    }
  }

  private async _fixFinding(finding: ScanFinding): Promise<void> {
    // Create a minimal bug object for the fix command
    const bug = {
      id: finding.id,
      title: `${finding.vulnerability_type} in ${finding.file_path}`,
      description: finding.context || finding.recommendation,
      severity: finding.risk_level,
      type: finding.vulnerability_type,
      affectedFile: finding.file_path,
      affectedLines: [finding.line_numbers[0], finding.line_numbers[finding.line_numbers.length - 1]] as [number, number],
      cweId: finding.cwe_id,
      status: 'Validated',
    };

    vscode.commands.executeCommand('olivex.fixWithClaude', bug);
  }

  private async _exportResults(format: 'json' | 'csv' | 'markdown'): Promise<void> {
    if (!this._results) return;

    let content: string;
    let language: string;
    let extension: string;

    switch (format) {
      case 'json':
        content = JSON.stringify(this._results, null, 2);
        language = 'json';
        extension = 'json';
        break;
      case 'csv':
        content = this._convertToCSV();
        language = 'plaintext';
        extension = 'csv';
        break;
      case 'markdown':
        content = this._convertToMarkdown();
        language = 'markdown';
        extension = 'md';
        break;
    }

    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(`scan-results.${extension}`),
      filters: { [format.toUpperCase()]: [extension] },
    });

    if (uri) {
      const encoder = new TextEncoder();
      await vscode.workspace.fs.writeFile(uri, encoder.encode(content));
      vscode.window.showInformationMessage(`Results exported to ${uri.fsPath}`);
    } else {
      // Just open as new document
      const doc = await vscode.workspace.openTextDocument({ content, language });
      await vscode.window.showTextDocument(doc);
    }
  }

  private _convertToCSV(): string {
    if (!this._results) return '';

    const headers = ['ID', 'Type', 'File', 'Lines', 'Risk', 'Confidence', 'CWE', 'Recommendation'];
    const rows = this._results.similar_vulnerabilities.map(f => [
      f.id,
      f.vulnerability_type,
      f.file_path,
      f.line_numbers.join('-'),
      f.risk_level,
      f.confidence,
      f.cwe_id || '',
      `"${f.recommendation.replace(/"/g, '""')}"`,
    ]);

    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }

  private _convertToMarkdown(): string {
    if (!this._results) return '';

    const lines: string[] = [];
    lines.push(`# Scan Results: ${this._bugTitle}`);
    lines.push('');
    lines.push('## Summary');
    lines.push(`- Files Scanned: ${this._results.scan_summary.files_scanned}`);
    lines.push(`- Total Findings: ${this._results.scan_summary.total_findings}`);
    lines.push('');

    if (this._results.similar_vulnerabilities.length > 0) {
      lines.push('## Findings');
      lines.push('');

      this._results.similar_vulnerabilities.forEach((f, i) => {
        const riskEmoji = this._getRiskEmoji(f.risk_level);
        lines.push(`### ${i + 1}. ${f.vulnerability_type} ${riskEmoji}`);
        lines.push('');
        lines.push(`- **File:** \`${f.file_path}\``);
        lines.push(`- **Lines:** ${f.line_numbers.join('-')}`);
        lines.push(`- **Risk Level:** ${f.risk_level.toUpperCase()}`);
        lines.push(`- **Confidence:** ${f.confidence}`);
        if (f.cwe_id) lines.push(`- **CWE:** ${f.cwe_id}`);
        lines.push('');
        if (f.code_snippet) {
          lines.push('**Code:**');
          lines.push('```');
          lines.push(f.code_snippet);
          lines.push('```');
          lines.push('');
        }
        lines.push(`**Recommendation:** ${f.recommendation}`);
        lines.push('');
        lines.push('---');
        lines.push('');
      });
    }

    if (this._results.recommendations && this._results.recommendations.length > 0) {
      lines.push('## General Recommendations');
      this._results.recommendations.forEach(r => lines.push(`- ${r}`));
    }

    return lines.join('\n');
  }

  private async _createBugReport(finding: ScanFinding): Promise<void> {
    const reportContent = `# Security Finding Report

## ${finding.vulnerability_type}

**File:** \`${finding.file_path}\`
**Lines:** ${finding.line_numbers.join('-')}
**Risk Level:** ${finding.risk_level.toUpperCase()}
**CWE:** ${finding.cwe_id || 'N/A'}

### Code Snippet
\`\`\`
${finding.code_snippet}
\`\`\`

### Context
${finding.context || 'No additional context available.'}

### Recommendation
${finding.recommendation}
`;

    const doc = await vscode.workspace.openTextDocument({
      content: reportContent,
      language: 'markdown',
    });
    await vscode.window.showTextDocument(doc);
  }

  private _update(): void {
    this._panel.title = `Scan Results: ${this._bugTitle.substring(0, 30)}`;
    this._panel.webview.html = this._getHtmlForWebview();
  }

  private _getHtmlForWebview(): string {
    if (!this._results) {
      return this._getEmptyHtml();
    }

    const results = this._results;
    const findingsHtml = results.similar_vulnerabilities.map((f, i) => this._getFindingHtml(f, i)).join('');
    const summaryByRisk = this._getSummaryByRisk(results.similar_vulnerabilities);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Scan Results</title>
  <style>
    :root {
      --vscode-font: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, sans-serif);
    }
    * { box-sizing: border-box; }
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
    .header h1 { margin: 0 0 8px 0; font-size: 20px; font-weight: 600; }
    .header .subtitle { color: var(--vscode-descriptionForeground); font-size: 13px; }

    .summary-cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 12px;
      margin-bottom: 24px;
    }
    .summary-card {
      padding: 16px;
      border-radius: 8px;
      text-align: center;
      background: var(--vscode-editor-inactiveSelectionBackground);
    }
    .summary-card.critical { border-left: 4px solid #d32f2f; }
    .summary-card.high { border-left: 4px solid #f57c00; }
    .summary-card.medium { border-left: 4px solid #fbc02d; }
    .summary-card.low { border-left: 4px solid #388e3c; }
    .summary-card.total { border-left: 4px solid #1976d2; }
    .summary-card .count { font-size: 28px; font-weight: 700; }
    .summary-card .label { font-size: 11px; text-transform: uppercase; color: var(--vscode-descriptionForeground); }

    .toolbar {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }
    .btn {
      padding: 6px 12px;
      border: none;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
    .btn-primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }

    .filters {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }
    .filter-chip {
      padding: 4px 12px;
      border-radius: 16px;
      font-size: 12px;
      cursor: pointer;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      border: 1px solid transparent;
    }
    .filter-chip.active { border-color: var(--vscode-focusBorder); }
    .filter-chip:hover { opacity: 0.8; }

    .findings-list { display: flex; flex-direction: column; gap: 12px; }

    .finding {
      padding: 16px;
      border-radius: 8px;
      background: var(--vscode-editor-inactiveSelectionBackground);
      border-left: 4px solid transparent;
      cursor: pointer;
      transition: transform 0.1s, box-shadow 0.1s;
    }
    .finding:hover {
      transform: translateX(4px);
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    }
    .finding.critical { border-left-color: #d32f2f; }
    .finding.high { border-left-color: #f57c00; }
    .finding.medium { border-left-color: #fbc02d; }
    .finding.low { border-left-color: #388e3c; }
    .finding.info { border-left-color: #1976d2; }

    .finding-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 8px;
    }
    .finding-title { font-weight: 600; font-size: 14px; }
    .finding-badges { display: flex; gap: 6px; }
    .badge {
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .badge.critical { background: #d32f2f; color: white; }
    .badge.high { background: #f57c00; color: white; }
    .badge.medium { background: #fbc02d; color: black; }
    .badge.low { background: #388e3c; color: white; }
    .badge.confidence { background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }

    .finding-location {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 8px;
      font-family: var(--vscode-editor-font-family);
    }
    .finding-snippet {
      font-size: 12px;
      padding: 8px;
      background: var(--vscode-textCodeBlock-background);
      border-radius: 4px;
      overflow-x: auto;
      font-family: var(--vscode-editor-font-family);
      margin-bottom: 8px;
      white-space: pre-wrap;
      max-height: 100px;
    }
    .finding-recommendation {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      padding-top: 8px;
      border-top: 1px solid var(--vscode-widget-border);
    }
    .finding-actions {
      display: flex;
      gap: 8px;
      margin-top: 12px;
    }
    .no-findings {
      text-align: center;
      padding: 40px;
      color: var(--vscode-descriptionForeground);
    }
    .no-findings .icon { font-size: 48px; margin-bottom: 16px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Security Scan Results</h1>
    <div class="subtitle">Scanned ${results.scan_summary.files_scanned} files • Found ${results.scan_summary.total_findings} potential issues</div>
  </div>

  <div class="summary-cards">
    <div class="summary-card total">
      <div class="count">${results.scan_summary.total_findings}</div>
      <div class="label">Total</div>
    </div>
    <div class="summary-card critical">
      <div class="count">${summaryByRisk.critical || 0}</div>
      <div class="label">Critical</div>
    </div>
    <div class="summary-card high">
      <div class="count">${summaryByRisk.high || 0}</div>
      <div class="label">High</div>
    </div>
    <div class="summary-card medium">
      <div class="count">${summaryByRisk.medium || 0}</div>
      <div class="label">Medium</div>
    </div>
    <div class="summary-card low">
      <div class="count">${summaryByRisk.low || 0}</div>
      <div class="label">Low</div>
    </div>
  </div>

  <div class="toolbar">
    <button class="btn" onclick="exportResults('json')">📄 Export JSON</button>
    <button class="btn" onclick="exportResults('csv')">📊 Export CSV</button>
    <button class="btn" onclick="exportResults('markdown')">📝 Export Markdown</button>
  </div>

  <div class="filters">
    <span class="filter-chip active" data-filter="all" onclick="filterFindings('all', this)">All</span>
    <span class="filter-chip" data-filter="critical" onclick="filterFindings('critical', this)">Critical</span>
    <span class="filter-chip" data-filter="high" onclick="filterFindings('high', this)">High</span>
    <span class="filter-chip" data-filter="medium" onclick="filterFindings('medium', this)">Medium</span>
    <span class="filter-chip" data-filter="low" onclick="filterFindings('low', this)">Low</span>
  </div>

  <div class="findings-list" id="findingsList">
    ${results.similar_vulnerabilities.length > 0 ? findingsHtml : `
      <div class="no-findings">
        <div class="icon">✅</div>
        <div>No similar vulnerabilities found!</div>
        <div>The codebase appears to be secure against this vulnerability type.</div>
      </div>
    `}
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const findings = ${JSON.stringify(results.similar_vulnerabilities)};

    function navigateToFinding(index) {
      vscode.postMessage({ command: 'navigateToFinding', finding: findings[index] });
    }

    function fixFinding(index, event) {
      event.stopPropagation();
      vscode.postMessage({ command: 'fixFinding', finding: findings[index] });
    }

    function createReport(index, event) {
      event.stopPropagation();
      vscode.postMessage({ command: 'createBugReport', finding: findings[index] });
    }

    function exportResults(format) {
      vscode.postMessage({ command: 'exportResults', format });
    }

    function filterFindings(riskLevel, element) {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      element.classList.add('active');

      document.querySelectorAll('.finding').forEach(f => {
        if (riskLevel === 'all' || f.classList.contains(riskLevel)) {
          f.style.display = 'block';
        } else {
          f.style.display = 'none';
        }
      });
    }
  </script>
</body>
</html>`;
  }

  private _getFindingHtml(finding: ScanFinding, index: number): string {
    const riskEmoji = this._getRiskEmoji(finding.risk_level);

    return `
      <div class="finding ${finding.risk_level}" onclick="navigateToFinding(${index})">
        <div class="finding-header">
          <div class="finding-title">${riskEmoji} ${this._escapeHtml(finding.vulnerability_type)}</div>
          <div class="finding-badges">
            <span class="badge ${finding.risk_level}">${finding.risk_level}</span>
            <span class="badge confidence">${finding.confidence}</span>
            ${finding.cwe_id ? `<span class="badge confidence">${finding.cwe_id}</span>` : ''}
          </div>
        </div>
        <div class="finding-location">📁 ${this._escapeHtml(finding.file_path)}:${finding.line_numbers.join('-')}</div>
        ${finding.code_snippet ? `<div class="finding-snippet">${this._escapeHtml(finding.code_snippet)}</div>` : ''}
        <div class="finding-recommendation">💡 ${this._escapeHtml(finding.recommendation)}</div>
        <div class="finding-actions">
          <button class="btn btn-primary" onclick="fixFinding(${index}, event)">🔧 Fix with Claude</button>
          <button class="btn" onclick="createReport(${index}, event)">📋 Create Report</button>
        </div>
      </div>
    `;
  }

  private _getSummaryByRisk(findings: ScanFinding[]): Record<string, number> {
    const summary: Record<string, number> = {};
    findings.forEach(f => {
      summary[f.risk_level] = (summary[f.risk_level] || 0) + 1;
    });
    return summary;
  }

  private _getRiskEmoji(riskLevel: string): string {
    const emojiMap: Record<string, string> = {
      critical: '🔴',
      high: '🟠',
      medium: '🟡',
      low: '🟢',
      info: '🔵',
    };
    return emojiMap[riskLevel] || '⚪';
  }

  private _getEmptyHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Scan Results</title>
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
  <p>No scan results available</p>
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
    ScanResultsPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) x.dispose();
    }
  }
}
