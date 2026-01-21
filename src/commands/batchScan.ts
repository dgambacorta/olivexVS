import * as vscode from 'vscode';
import { ClaudeCodeCLIExecutor } from '../claude/cli-executor';
import { ScanResultsPanel, ScanResults, ScanFinding } from '../providers/scanResultsPanel';
import { VULNERABILITY_PATTERNS, VulnerabilityPattern, buildGrepPatterns } from '../claude/vulnerability-patterns';
import { securitySystemPrompt, buildAdvancedScanPrompt } from '../claude/prompts/fix-prompt';

/**
 * Batch scan options
 */
interface BatchScanOptions {
  patterns: VulnerabilityPattern[];
  excludePaths?: string[];
  maxFindings?: number;
}

/**
 * Register batch scanning commands
 */
export async function registerBatchScanCommands(
  context: vscode.ExtensionContext,
  cliExecutor: ClaudeCodeCLIExecutor
): Promise<void> {
  // Full security audit command
  context.subscriptions.push(
    vscode.commands.registerCommand('olivex.fullSecurityAudit', async () => {
      // Check if Claude CLI is installed
      const isInstalled = await cliExecutor.isClaudeInstalled();
      if (!isInstalled) {
        vscode.window.showErrorMessage(
          'Claude Code CLI is not installed. Please install it from https://claude.ai/code'
        );
        return;
      }

      // Let user select which patterns to scan for
      const patternItems = VULNERABILITY_PATTERNS.map(p => ({
        label: p.name,
        description: `${p.category} - ${p.cweIds.join(', ')}`,
        detail: p.description,
        picked: true,
        pattern: p,
      }));

      const selectedPatterns = await vscode.window.showQuickPick(patternItems, {
        placeHolder: 'Select vulnerability types to scan for',
        canPickMany: true,
        title: 'Security Audit Configuration',
      });

      if (!selectedPatterns || selectedPatterns.length === 0) {
        return;
      }

      await runBatchScan(context, cliExecutor, {
        patterns: selectedPatterns.map(s => s.pattern),
      });
    })
  );

  // Quick scan for common vulnerabilities
  context.subscriptions.push(
    vscode.commands.registerCommand('olivex.quickSecurityScan', async () => {
      const isInstalled = await cliExecutor.isClaudeInstalled();
      if (!isInstalled) {
        vscode.window.showErrorMessage(
          'Claude Code CLI is not installed. Please install it from https://claude.ai/code'
        );
        return;
      }

      // Scan for top 5 most common vulnerabilities
      const topPatterns = VULNERABILITY_PATTERNS.filter(p =>
        ['sqli', 'xss', 'cmdi', 'hardcoded-secrets', 'path-traversal'].includes(p.id)
      );

      await runBatchScan(context, cliExecutor, {
        patterns: topPatterns,
        maxFindings: 50,
      });
    })
  );

  // Scan for specific vulnerability type
  context.subscriptions.push(
    vscode.commands.registerCommand('olivex.scanForVulnType', async () => {
      const isInstalled = await cliExecutor.isClaudeInstalled();
      if (!isInstalled) {
        vscode.window.showErrorMessage(
          'Claude Code CLI is not installed. Please install it from https://claude.ai/code'
        );
        return;
      }

      const patternItems = VULNERABILITY_PATTERNS.map(p => ({
        label: p.name,
        description: p.category,
        detail: `${p.cweIds.join(', ')} - ${p.description.substring(0, 80)}...`,
        pattern: p,
      }));

      const selected = await vscode.window.showQuickPick(patternItems, {
        placeHolder: 'Select vulnerability type to scan for',
        title: 'Vulnerability Scan',
      });

      if (!selected) {
        return;
      }

      await runBatchScan(context, cliExecutor, {
        patterns: [selected.pattern],
      });
    })
  );
}

/**
 * Run batch scan with multiple patterns
 */
async function runBatchScan(
  context: vscode.ExtensionContext,
  cliExecutor: ClaudeCodeCLIExecutor,
  options: BatchScanOptions
): Promise<void> {
  const { patterns, excludePaths, maxFindings } = options;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Security Audit',
      cancellable: true,
    },
    async (progress, token) => {
      const allFindings: ScanFinding[] = [];
      const patternsChecked: string[] = [];
      let filesScanned = 0;

      for (let i = 0; i < patterns.length; i++) {
        if (token.isCancellationRequested) {
          break;
        }

        const pattern = patterns[i];
        const progressPercent = (i / patterns.length) * 100;

        progress.report({
          message: `Scanning for ${pattern.name}... (${i + 1}/${patterns.length})`,
          increment: progressPercent / patterns.length,
        });

        try {
          const prompt = buildAdvancedScanPrompt(pattern.id, pattern, excludePaths);

          const result = await cliExecutor.execute<ScanResults>({
            prompt,
            outputFormat: 'json',
            appendSystemPrompt: securitySystemPrompt,
            allowedTools: ['Read', 'Glob', 'Grep'],
            maxTurns: 10,
            timeout: 180000, // 3 minutes per pattern
          });

          if (result.success && result.output) {
            const findings = result.output.similar_vulnerabilities || [];
            allFindings.push(...findings.map((f: any, idx: number) => ({
              id: `${pattern.id}-${idx + 1}`,
              vulnerability_type: f.vulnerability_type || pattern.name,
              file_path: f.file_path || 'unknown',
              line_numbers: f.line_numbers || [1],
              code_snippet: f.code_snippet || '',
              risk_level: f.risk_level || 'medium',
              confidence: f.confidence || 'medium',
              similarity_score: f.similarity_score,
              matched_pattern: f.matched_pattern || pattern.name,
              context: f.context,
              recommendation: f.recommendation || pattern.remediation,
              cwe_id: f.cwe_id || pattern.cweIds[0],
            })));

            filesScanned += result.output.scan_summary?.files_scanned || 0;
            patternsChecked.push(...pattern.searchPatterns.map(sp => sp.description));
          }

          // Check max findings limit
          if (maxFindings && allFindings.length >= maxFindings) {
            allFindings.splice(maxFindings);
            break;
          }

        } catch (error: any) {
          console.error(`Error scanning for ${pattern.name}:`, error);
          // Continue with next pattern
        }
      }

      progress.report({ message: 'Preparing results...', increment: 100 });

      // Sort findings by risk level
      const riskOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
      allFindings.sort((a, b) =>
        (riskOrder[a.risk_level] || 5) - (riskOrder[b.risk_level] || 5)
      );

      // Create combined results
      const combinedResults: ScanResults = {
        scan_summary: {
          files_scanned: filesScanned,
          total_findings: allFindings.length,
          patterns_checked: [...new Set(patternsChecked)],
        },
        similar_vulnerabilities: allFindings,
        recommendations: patterns.map(p => p.remediation),
      };

      // Show results panel
      ScanResultsPanel.createOrShow(context.extensionUri, combinedResults, 'Security Audit');

      // Show summary notification
      const criticalCount = allFindings.filter(f => f.risk_level === 'critical').length;
      const highCount = allFindings.filter(f => f.risk_level === 'high').length;

      if (allFindings.length === 0) {
        vscode.window.showInformationMessage(
          'Security audit complete. No vulnerabilities found!',
          'View Report'
        );
      } else if (criticalCount > 0 || highCount > 0) {
        vscode.window.showWarningMessage(
          `Security audit found ${allFindings.length} issues (${criticalCount} critical, ${highCount} high)`,
          'View Details'
        ).then(action => {
          if (action === 'View Details') {
            ScanResultsPanel.createOrShow(context.extensionUri, combinedResults, 'Security Audit');
          }
        });
      } else {
        vscode.window.showInformationMessage(
          `Security audit complete. Found ${allFindings.length} potential issues.`,
          'View Details'
        ).then(action => {
          if (action === 'View Details') {
            ScanResultsPanel.createOrShow(context.extensionUri, combinedResults, 'Security Audit');
          }
        });
      }
    }
  );
}
