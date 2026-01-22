import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ClaudeCodeCLIExecutor } from '../claude/cli-executor';
import { ScanResultsPanel, ScanResults, ScanFinding } from '../providers/scanResultsPanel';
import { VULNERABILITY_PATTERNS } from '../claude/vulnerability-patterns';
import { securitySystemPrompt, getVulnerabilityExamples } from '../claude/prompts/fix-prompt';

/**
 * Security review result structure
 */
interface SecurityReviewResult {
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    total: number;
  };
  findings: SecurityFinding[];
  recommendations: string[];
  scan_info: {
    file_or_directory: string;
    patterns_checked: string[];
  };
}

interface SecurityFinding {
  severity: 'critical' | 'high' | 'medium' | 'low';
  type: string;
  cwe?: string;
  file_path: string;
  line_number?: number;
  vulnerable_code: string;
  fixed_code: string;
  explanation: string;
}

/**
 * Build the security review prompt
 */
function buildSecurityReviewPrompt(targetPath: string, codeContent?: string): string {
  const sections: string[] = [];

  sections.push('# Security Review - Vulnerability Analysis');
  sections.push('');
  sections.push('You are an expert application security analyst. Analyze the provided code for security vulnerabilities.');
  sections.push('');

  sections.push('## Target');
  sections.push(`Path: \`${targetPath}\``);
  sections.push('');

  if (codeContent) {
    sections.push('## Code to Review');
    sections.push('```');
    sections.push(codeContent);
    sections.push('```');
    sections.push('');
  }

  sections.push('## Vulnerability Categories to Check (in priority order)');
  sections.push('');

  const priorityPatterns = [
    'slopsquatting',
    'xss',
    'hardcoded-secrets',
    'sqli',
    'missing-auth',
    'input-validation',
    'cmdi',
    'rate-limiting',
    'data-exposure',
    'file-upload',
    'ssrf',
    'path-traversal',
    'weak-crypto',
    'idor',
    'deserialization',
  ];

  priorityPatterns.forEach((patternId, idx) => {
    const pattern = VULNERABILITY_PATTERNS.find(p => p.id === patternId);
    if (pattern) {
      sections.push(`${idx + 1}. **${pattern.name}** (${pattern.cweIds.join(', ')}) - ${pattern.description.substring(0, 100)}...`);
    }
  });

  sections.push('');
  sections.push('## Analysis Instructions');
  sections.push('');
  sections.push('For each vulnerability found:');
  sections.push('1. Identify the exact file and line number');
  sections.push('2. Classify the vulnerability type and CWE');
  sections.push('3. Assign severity (Critical/High/Medium/Low)');
  sections.push('4. Show the vulnerable code (BAD)');
  sections.push('5. Provide corrected code (GOOD)');
  sections.push('6. Explain the risk and the fix');
  sections.push('');

  sections.push('## Output Format');
  sections.push('');
  sections.push('Return JSON with this structure:');
  sections.push('```json');
  sections.push('{');
  sections.push('  "summary": {');
  sections.push('    "critical": 0,');
  sections.push('    "high": 0,');
  sections.push('    "medium": 0,');
  sections.push('    "low": 0,');
  sections.push('    "total": 0');
  sections.push('  },');
  sections.push('  "findings": [');
  sections.push('    {');
  sections.push('      "severity": "critical|high|medium|low",');
  sections.push('      "type": "SQL Injection",');
  sections.push('      "cwe": "CWE-89",');
  sections.push('      "file_path": "src/api/users.ts",');
  sections.push('      "line_number": 42,');
  sections.push('      "vulnerable_code": "const q = `SELECT * FROM users WHERE id = ${id}`",');
  sections.push('      "fixed_code": "const q = await db.query(\'SELECT * FROM users WHERE id = $1\', [id])",');
  sections.push('      "explanation": "User input concatenated into SQL query allows injection attacks."');
  sections.push('    }');
  sections.push('  ],');
  sections.push('  "recommendations": [');
  sections.push('    "Implement parameterized queries throughout the codebase",');
  sections.push('    "Add input validation middleware"');
  sections.push('  ]');
  sections.push('}');
  sections.push('```');
  sections.push('');
  sections.push('If no vulnerabilities are found, return an empty findings array and add a recommendation for manual review.');

  return sections.join('\n');
}

/**
 * Convert security review result to scan results format for the panel
 */
function convertToScanResults(result: SecurityReviewResult, targetPath: string): ScanResults {
  const findings: ScanFinding[] = result.findings.map((f, idx) => ({
    id: `review-${idx + 1}`,
    vulnerability_type: f.type,
    file_path: f.file_path,
    line_numbers: f.line_number ? [f.line_number] : [1],
    code_snippet: f.vulnerable_code,
    risk_level: f.severity,
    confidence: 'high' as const,
    matched_pattern: f.type,
    context: f.explanation,
    recommendation: `**Fixed Code:**\n\`\`\`\n${f.fixed_code}\n\`\`\``,
    cwe_id: f.cwe,
  }));

  return {
    scan_summary: {
      files_scanned: 1,
      total_findings: result.summary.total,
      patterns_checked: result.scan_info.patterns_checked,
    },
    similar_vulnerabilities: findings,
    recommendations: result.recommendations,
  };
}

/**
 * Register security review commands
 */
export async function registerSecurityReviewCommands(
  context: vscode.ExtensionContext,
  cliExecutor: ClaudeCodeCLIExecutor
): Promise<void> {
  // Security review for current file
  context.subscriptions.push(
    vscode.commands.registerCommand('olivex.securityReview', async (fileUri?: vscode.Uri) => {
      const isInstalled = await cliExecutor.isClaudeInstalled();
      if (!isInstalled) {
        vscode.window.showErrorMessage(
          'Claude Code CLI is not installed. Please install it from https://claude.ai/code'
        );
        return;
      }

      // Get target file
      let targetPath: string;
      let codeContent: string | undefined;

      if (fileUri) {
        targetPath = fileUri.fsPath;
      } else {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
          // Ask user to select a file or folder
          const selected = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: true,
            canSelectMany: false,
            title: 'Select file or folder for security review',
          });

          if (!selected || selected.length === 0) {
            return;
          }
          targetPath = selected[0].fsPath;
        } else {
          targetPath = activeEditor.document.fileName;

          // Check for selection
          const selection = activeEditor.selection;
          if (!selection.isEmpty) {
            codeContent = activeEditor.document.getText(selection);
          }
        }
      }

      await runSecurityReview(context, cliExecutor, targetPath, codeContent);
    })
  );

  // Security review with fix option
  context.subscriptions.push(
    vscode.commands.registerCommand('olivex.securityReviewAndFix', async (fileUri?: vscode.Uri) => {
      const isInstalled = await cliExecutor.isClaudeInstalled();
      if (!isInstalled) {
        vscode.window.showErrorMessage(
          'Claude Code CLI is not installed. Please install it from https://claude.ai/code'
        );
        return;
      }

      // Get target file
      let targetPath: string;

      if (fileUri) {
        targetPath = fileUri.fsPath;
      } else {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
          vscode.window.showErrorMessage('No active file to review');
          return;
        }
        targetPath = activeEditor.document.fileName;
      }

      await runSecurityReview(context, cliExecutor, targetPath, undefined, true);
    })
  );

  // Review folder recursively
  context.subscriptions.push(
    vscode.commands.registerCommand('olivex.securityReviewFolder', async (folderUri?: vscode.Uri) => {
      const isInstalled = await cliExecutor.isClaudeInstalled();
      if (!isInstalled) {
        vscode.window.showErrorMessage(
          'Claude Code CLI is not installed. Please install it from https://claude.ai/code'
        );
        return;
      }

      let targetPath: string;

      if (folderUri) {
        targetPath = folderUri.fsPath;
      } else {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
          vscode.window.showErrorMessage('No workspace folder open');
          return;
        }

        // Let user select which folder
        if (workspaceFolders.length === 1) {
          targetPath = workspaceFolders[0].uri.fsPath;
        } else {
          const folderItems = workspaceFolders.map(f => ({
            label: f.name,
            description: f.uri.fsPath,
            uri: f.uri,
          }));

          const selected = await vscode.window.showQuickPick(folderItems, {
            placeHolder: 'Select folder for security review',
          });

          if (!selected) {
            return;
          }
          targetPath = selected.uri.fsPath;
        }
      }

      await runSecurityReview(context, cliExecutor, targetPath);
    })
  );

  // Context menu command for files
  context.subscriptions.push(
    vscode.commands.registerCommand('olivex.securityReviewFile', async (fileUri: vscode.Uri) => {
      if (!fileUri) {
        return;
      }

      const isInstalled = await cliExecutor.isClaudeInstalled();
      if (!isInstalled) {
        vscode.window.showErrorMessage(
          'Claude Code CLI is not installed. Please install it from https://claude.ai/code'
        );
        return;
      }

      await runSecurityReview(context, cliExecutor, fileUri.fsPath);
    })
  );
}

/**
 * Run security review on target
 */
async function runSecurityReview(
  context: vscode.ExtensionContext,
  cliExecutor: ClaudeCodeCLIExecutor,
  targetPath: string,
  codeContent?: string,
  offerFix: boolean = false
): Promise<void> {
  const fileName = path.basename(targetPath);
  const isDirectory = fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory();

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Security Review: ${fileName}`,
      cancellable: true,
    },
    async (progress, token) => {
      progress.report({ message: 'Analyzing code for vulnerabilities...' });

      try {
        const prompt = buildSecurityReviewPrompt(targetPath, codeContent);

        const allowedTools = isDirectory
          ? ['Read', 'Glob', 'Grep']
          : ['Read'];

        const result = await cliExecutor.execute<SecurityReviewResult>({
          prompt,
          outputFormat: 'json',
          appendSystemPrompt: securitySystemPrompt,
          allowedTools,
          maxTurns: isDirectory ? 20 : 10,
          timeout: isDirectory ? 300000 : 120000, // 5 min for dirs, 2 min for files
        });

        if (token.isCancellationRequested) {
          return;
        }

        if (!result.success || !result.output) {
          vscode.window.showErrorMessage(
            `Security review failed: ${result.error || 'Unknown error'}`
          );
          return;
        }

        const reviewResult = result.output;
        progress.report({ message: 'Preparing report...' });

        // Update summary counts if not present
        if (!reviewResult.summary) {
          reviewResult.summary = {
            critical: 0,
            high: 0,
            medium: 0,
            low: 0,
            total: reviewResult.findings?.length || 0,
          };

          reviewResult.findings?.forEach(f => {
            const sev = f.severity?.toLowerCase() as keyof typeof reviewResult.summary;
            if (sev && reviewResult.summary[sev] !== undefined) {
              reviewResult.summary[sev]++;
            }
          });
        }

        // Convert to scan results format
        const scanResults = convertToScanResults(reviewResult, targetPath);

        // Add scan info
        if (!reviewResult.scan_info) {
          reviewResult.scan_info = {
            file_or_directory: targetPath,
            patterns_checked: VULNERABILITY_PATTERNS.slice(0, 15).map(p => p.name),
          };
        }

        scanResults.scan_summary.patterns_checked = reviewResult.scan_info.patterns_checked;

        // Show results panel
        ScanResultsPanel.createOrShow(context.extensionUri, scanResults, `Security Review: ${fileName}`);

        // Show summary notification
        const { critical, high, medium, low, total } = reviewResult.summary;

        if (total === 0) {
          vscode.window.showInformationMessage(
            `✅ Security review complete. No vulnerabilities found in ${fileName}!`,
            'View Report'
          ).then(action => {
            if (action === 'View Report') {
              ScanResultsPanel.createOrShow(context.extensionUri, scanResults, `Security Review: ${fileName}`);
            }
          });
        } else if (critical > 0 || high > 0) {
          const actions = offerFix ? ['View Details', 'Auto-Fix All'] : ['View Details'];

          vscode.window.showWarningMessage(
            `⚠️ Found ${total} issues in ${fileName}: ${critical} critical, ${high} high, ${medium} medium, ${low} low`,
            ...actions
          ).then(action => {
            if (action === 'View Details') {
              ScanResultsPanel.createOrShow(context.extensionUri, scanResults, `Security Review: ${fileName}`);
            } else if (action === 'Auto-Fix All') {
              // Trigger fix workflow for each finding
              vscode.window.showInformationMessage('Auto-fix feature coming soon!');
            }
          });
        } else {
          vscode.window.showInformationMessage(
            `Found ${total} potential issues in ${fileName}: ${medium} medium, ${low} low`,
            'View Details'
          ).then(action => {
            if (action === 'View Details') {
              ScanResultsPanel.createOrShow(context.extensionUri, scanResults, `Security Review: ${fileName}`);
            }
          });
        }

      } catch (error: any) {
        console.error('Security review error:', error);
        vscode.window.showErrorMessage(
          `Security review failed: ${error.message || 'Unknown error'}`
        );
      }
    }
  );
}

/**
 * Generate markdown report from security review
 */
export function generateSecurityReviewReport(result: SecurityReviewResult): string {
  const lines: string[] = [];

  lines.push('# Security Review Report');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Severity | Count |');
  lines.push('|----------|-------|');
  lines.push(`| Critical | ${result.summary.critical} |`);
  lines.push(`| High | ${result.summary.high} |`);
  lines.push(`| Medium | ${result.summary.medium} |`);
  lines.push(`| Low | ${result.summary.low} |`);
  lines.push(`| **Total** | **${result.summary.total}** |`);
  lines.push('');

  if (result.findings.length === 0) {
    lines.push('No vulnerabilities found. Manual review is still recommended.');
    lines.push('');
  } else {
    lines.push('---');
    lines.push('');
    lines.push('## Findings');
    lines.push('');

    result.findings.forEach((finding, idx) => {
      const severityEmoji = {
        critical: '🔴',
        high: '🟠',
        medium: '🟡',
        low: '🟢',
      }[finding.severity] || '⚪';

      lines.push(`### ${severityEmoji} [${finding.severity.toUpperCase()}] ${finding.type}`);
      lines.push('');
      lines.push(`**File:** \`${finding.file_path}${finding.line_number ? ':' + finding.line_number : ''}\``);
      if (finding.cwe) {
        lines.push(`**CWE:** ${finding.cwe}`);
      }
      lines.push('');
      lines.push('**Vulnerable Code:**');
      lines.push('```');
      lines.push(finding.vulnerable_code);
      lines.push('```');
      lines.push('');
      lines.push('**Fixed Code:**');
      lines.push('```');
      lines.push(finding.fixed_code);
      lines.push('```');
      lines.push('');
      lines.push(`**Explanation:** ${finding.explanation}`);
      lines.push('');
      lines.push('---');
      lines.push('');
    });
  }

  if (result.recommendations.length > 0) {
    lines.push('## Recommendations');
    lines.push('');
    result.recommendations.forEach(rec => {
      lines.push(`- ${rec}`);
    });
    lines.push('');
  }

  return lines.join('\n');
}
