import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ClaudeCodeCLIExecutor, FixResult } from '../claude/cli-executor';
import { FixPreviewPanel } from '../providers/fixPreviewPanel';
import { ScanResultsPanel, ScanResults } from '../providers/scanResultsPanel';
import { BugItem } from '../providers/bugTreeView';
import { buildFixPrompt, securitySystemPrompt } from '../claude/prompts/fix-prompt';
import { Bug } from '../types';
import { getPatternsByType } from '../claude/vulnerability-patterns';

/**
 * Register the fixWithClaude command
 */
export async function registerFixWithClaudeCommand(
  context: vscode.ExtensionContext,
  cliExecutor: ClaudeCodeCLIExecutor
): Promise<void> {
  context.subscriptions.push(
    vscode.commands.registerCommand('olivex.fixWithClaude', async (item: BugItem | Bug) => {
      // Handle both BugItem from tree view and Bug directly
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
          'Use Legacy Mode'
        );

        if (action === 'Install Instructions') {
          vscode.env.openExternal(vscode.Uri.parse('https://claude.ai/code'));
        } else if (action === 'Use Legacy Mode') {
          // Fall back to clipboard mode
          vscode.commands.executeCommand('olivex.fixBug', item);
        }
        return;
      }

      // Show progress
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Analyzing vulnerability: ${bug.title}`,
          cancellable: true,
        },
        async (progress, token) => {
          try {
            // Check for cancellation
            if (token.isCancellationRequested) {
              return;
            }

            progress.report({ message: 'Building security context...' });

            // Build the prompt
            const prompt = buildFixPrompt(bug);

            progress.report({ message: 'Executing Claude Code analysis...', increment: 20 });

            // Execute Claude Code CLI
            const result = await cliExecutor.executeFix(prompt, securitySystemPrompt);

            if (token.isCancellationRequested) {
              return;
            }

            if (!result.success) {
              // Handle error
              const retry = await vscode.window.showErrorMessage(
                `Fix generation failed: ${result.error}`,
                'Retry',
                'Use Legacy Mode',
                'Show Output'
              );

              if (retry === 'Retry') {
                vscode.commands.executeCommand('olivex.fixWithClaude', item);
              } else if (retry === 'Use Legacy Mode') {
                vscode.commands.executeCommand('olivex.fixBug', item);
              } else if (retry === 'Show Output') {
                cliExecutor.showOutput();
              }
              return;
            }

            progress.report({ message: 'Preparing fix preview...', increment: 60 });

            // Show preview panel
            FixPreviewPanel.createOrShow(
              context.extensionUri,
              bug,
              result.output,
              async (fix: FixResult) => {
                // Handle accept
                await applyFix(bug, fix);
              },
              () => {
                // Handle reject
                vscode.window.showInformationMessage('Fix rejected');
              }
            );

            progress.report({ increment: 100 });

          } catch (error: any) {
            vscode.window.showErrorMessage(`Error: ${error.message}`);
            cliExecutor.showOutput();
          }
        }
      );
    })
  );

  // Register the command to generate tests
  context.subscriptions.push(
    vscode.commands.registerCommand('olivex.generateTests', async (item: BugItem | Bug) => {
      const bug: Bug = 'bug' in item ? item.bug : item;

      if (!bug) {
        vscode.window.showErrorMessage('No bug selected');
        return;
      }

      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Generating security tests for: ${bug.title}`,
          cancellable: false,
        },
        async (progress) => {
          try {
            progress.report({ message: 'Analyzing vulnerability...' });

            const { buildTestPrompt } = await import('../claude/prompts/fix-prompt');
            const prompt = buildTestPrompt(bug);

            progress.report({ message: 'Generating test cases...', increment: 30 });

            const result = await cliExecutor.execute({
              prompt,
              outputFormat: 'json',
              appendSystemPrompt: securitySystemPrompt,
              allowedTools: ['Read', 'Glob', 'Grep'],
              maxTurns: 5,
              timeout: 120000,
            });

            if (result.success && result.output) {
              progress.report({ message: 'Tests generated!', increment: 100 });

              // Show the test results
              const doc = await vscode.workspace.openTextDocument({
                content: JSON.stringify(result.output, null, 2),
                language: 'json',
              });
              await vscode.window.showTextDocument(doc);

              vscode.window.showInformationMessage('Security tests generated successfully!');
            } else {
              vscode.window.showErrorMessage(`Failed to generate tests: ${result.error}`);
            }
          } catch (error: any) {
            vscode.window.showErrorMessage(`Error: ${error.message}`);
          }
        }
      );
    })
  );

  // Register the command to scan for similar vulnerabilities
  context.subscriptions.push(
    vscode.commands.registerCommand('olivex.scanSimilar', async (item: BugItem | Bug) => {
      const bug: Bug = 'bug' in item ? item.bug : item;

      if (!bug) {
        vscode.window.showErrorMessage('No bug selected');
        return;
      }

      // Check if Claude CLI is installed
      const isInstalled = await cliExecutor.isClaudeInstalled();
      if (!isInstalled) {
        vscode.window.showErrorMessage(
          'Claude Code CLI is not installed. Please install it from https://claude.ai/code'
        );
        return;
      }

      // Get vulnerability patterns for enhanced scanning
      const pattern = getPatternsByType(bug.type || '');

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Scanning for similar vulnerabilities...`,
          cancellable: true,
        },
        async (progress, token) => {
          try {
            progress.report({ message: 'Analyzing vulnerability pattern...' });

            const { buildScanPrompt } = await import('../claude/prompts/fix-prompt');
            const prompt = buildScanPrompt(bug);

            if (token.isCancellationRequested) {
              return;
            }

            progress.report({ message: 'Scanning codebase with pattern matching...', increment: 20 });

            const result = await cliExecutor.execute<ScanResults>({
              prompt,
              outputFormat: 'json',
              appendSystemPrompt: securitySystemPrompt,
              allowedTools: ['Read', 'Glob', 'Grep'],
              maxTurns: 20,
              timeout: 420000, // 7 minutes for comprehensive scanning
            });

            if (token.isCancellationRequested) {
              return;
            }

            if (result.success && result.output) {
              progress.report({ message: 'Processing results...', increment: 60 });

              // Ensure proper structure
              const scanResults: ScanResults = {
                scan_summary: result.output.scan_summary || {
                  files_scanned: 0,
                  total_findings: result.output.similar_vulnerabilities?.length || 0,
                  patterns_checked: pattern ? pattern.searchPatterns.map(p => p.description) : [],
                },
                similar_vulnerabilities: (result.output.similar_vulnerabilities || []).map((v: any, i: number) => ({
                  id: v.id || `finding-${i + 1}`,
                  vulnerability_type: v.vulnerability_type || bug.type || 'Unknown',
                  file_path: v.file_path || 'unknown',
                  line_numbers: v.line_numbers || [1],
                  code_snippet: v.code_snippet || '',
                  risk_level: v.risk_level || 'medium',
                  confidence: v.confidence || 'medium',
                  similarity_score: v.similarity_score,
                  matched_pattern: v.matched_pattern,
                  context: v.context,
                  recommendation: v.recommendation || 'Review and fix this vulnerability',
                  cwe_id: v.cwe_id || bug.cweId,
                })),
                files_with_issues: result.output.files_with_issues,
                recommendations: result.output.recommendations,
              };

              progress.report({ message: 'Scan complete!', increment: 100 });

              // Show results in the new panel
              ScanResultsPanel.createOrShow(context.extensionUri, scanResults, bug.title);

              if (scanResults.similar_vulnerabilities.length === 0) {
                vscode.window.showInformationMessage('No similar vulnerabilities found in the codebase.');
              } else {
                vscode.window.showWarningMessage(
                  `Found ${scanResults.similar_vulnerabilities.length} similar vulnerabilities!`,
                  'View Details'
                ).then(action => {
                  if (action === 'View Details') {
                    ScanResultsPanel.createOrShow(context.extensionUri, scanResults, bug.title);
                  }
                });
              }
            } else {
              vscode.window.showErrorMessage(`Scan failed: ${result.error}`);
              cliExecutor.showOutput();
            }
          } catch (error: any) {
            vscode.window.showErrorMessage(`Error: ${error.message}`);
            cliExecutor.showOutput();
          }
        }
      );
    })
  );

  // Register interactive mode command
  context.subscriptions.push(
    vscode.commands.registerCommand('olivex.interactiveFix', async (item: BugItem | Bug) => {
      const bug: Bug = 'bug' in item ? item.bug : item;

      if (!bug) {
        vscode.window.showErrorMessage('No bug selected');
        return;
      }

      const prompt = buildFixPrompt(bug);
      await cliExecutor.openInteractiveSession(prompt);
    })
  );
}

/**
 * Apply the fix to the file
 */
async function applyFix(bug: Bug, fix: FixResult): Promise<void> {
  if (!fix.fix?.file_path || !fix.fix?.fixed_code) {
    vscode.window.showErrorMessage('Invalid fix: missing file path or code');
    return;
  }

  try {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      vscode.window.showErrorMessage('No workspace folder open');
      return;
    }

    const filePath = path.isAbsolute(fix.fix.file_path)
      ? fix.fix.file_path
      : path.join(workspaceFolders[0].uri.fsPath, fix.fix.file_path);

    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      // File doesn't exist, ask user what to do
      const action = await vscode.window.showWarningMessage(
        `File not found: ${fix.fix.file_path}`,
        'Create File',
        'Choose Location',
        'Cancel'
      );

      if (action === 'Create File') {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, fix.fix.fixed_code, 'utf-8');
      } else if (action === 'Choose Location') {
        const uri = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.file(filePath),
          filters: { 'All Files': ['*'] },
        });
        if (uri) {
          await fs.writeFile(uri.fsPath, fix.fix.fixed_code, 'utf-8');
          const doc = await vscode.workspace.openTextDocument(uri);
          await vscode.window.showTextDocument(doc);
        }
        return;
      } else {
        return;
      }
    }

    // Open the file and show a diff
    const uri = vscode.Uri.file(filePath);
    const doc = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(doc);

    // If we have original code, try to find and replace it
    if (fix.fix.original_code) {
      const text = doc.getText();
      const originalCode = fix.fix.original_code.trim();
      const startIndex = text.indexOf(originalCode);

      if (startIndex !== -1) {
        const startPos = doc.positionAt(startIndex);
        const endPos = doc.positionAt(startIndex + originalCode.length);
        const range = new vscode.Range(startPos, endPos);

        await editor.edit((editBuilder) => {
          editBuilder.replace(range, fix.fix.fixed_code);
        });

        // Save the file
        await doc.save();

        vscode.window.showInformationMessage(
          `✅ Fix applied to ${fix.fix.file_path}`,
          'View Changes'
        ).then((action) => {
          if (action === 'View Changes') {
            vscode.commands.executeCommand('git.openChange', uri);
          }
        });
      } else {
        // Couldn't find exact match, show the code to copy
        vscode.window.showWarningMessage(
          'Could not find exact code location. The fixed code has been copied to clipboard.',
          'OK'
        );
        await vscode.env.clipboard.writeText(fix.fix.fixed_code);
      }
    } else {
      // No original code, just copy to clipboard
      await vscode.env.clipboard.writeText(fix.fix.fixed_code);
      vscode.window.showInformationMessage(
        'Fixed code copied to clipboard. Please apply manually.',
        'OK'
      );
    }

  } catch (error: any) {
    vscode.window.showErrorMessage(`Failed to apply fix: ${error.message}`);
  }
}

/**
 * Format scan results as markdown
 */
function formatScanResults(results: any): string {
  const lines: string[] = [];

  lines.push('# Similar Vulnerability Scan Results');
  lines.push('');

  if (results.scan_summary) {
    lines.push('## Summary');
    lines.push(`- Files scanned: ${results.scan_summary.files_scanned || 'Unknown'}`);
    lines.push(`- Total findings: ${results.scan_summary.total_findings || 0}`);
    if (results.scan_summary.patterns_checked?.length) {
      lines.push(`- Patterns checked: ${results.scan_summary.patterns_checked.join(', ')}`);
    }
    lines.push('');
  }

  if (results.similar_vulnerabilities?.length) {
    lines.push('## Findings');
    lines.push('');

    results.similar_vulnerabilities.forEach((finding: any, index: number) => {
      const riskColorMap: Record<string, string> = {
        critical: '🔴',
        high: '🟠',
        medium: '🟡',
        low: '🟢',
      };
      const riskLevel = finding.risk_level?.toLowerCase() || '';
      const riskColor = riskColorMap[riskLevel] || '⚪';

      lines.push(`### ${index + 1}. ${finding.vulnerability_type || 'Unknown'} ${riskColor}`);
      lines.push('');
      lines.push(`- **File:** \`${finding.file_path}\``);
      if (finding.line_numbers?.length) {
        lines.push(`- **Lines:** ${finding.line_numbers.join(', ')}`);
      }
      lines.push(`- **Risk Level:** ${finding.risk_level?.toUpperCase() || 'Unknown'}`);
      if (finding.similarity_score) {
        lines.push(`- **Similarity:** ${Math.round(finding.similarity_score * 100)}%`);
      }
      lines.push('');

      if (finding.code_snippet) {
        lines.push('**Code:**');
        lines.push('```');
        lines.push(finding.code_snippet);
        lines.push('```');
        lines.push('');
      }

      if (finding.recommendation) {
        lines.push(`**Recommendation:** ${finding.recommendation}`);
        lines.push('');
      }

      lines.push('---');
      lines.push('');
    });
  }

  return lines.join('\n');
}
