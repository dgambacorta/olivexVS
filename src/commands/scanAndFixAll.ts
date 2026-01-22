import * as vscode from 'vscode';
import { Bug } from '../types';
import { ClaudeCodeCLIExecutor } from '../claude/cli-executor';
import { ScanResultsPanel, ScanFinding } from '../providers/scanResultsPanel';
import { FixPreviewPanel } from '../providers/fixPreviewPanel';
import { getPatternsByType, VULNERABILITY_PATTERNS } from '../claude/vulnerability-patterns';
import { securitySystemPrompt, getVulnerabilityExamples } from '../claude/prompts/fix-prompt';

/**
 * Result from scanning and fixing
 */
interface ScanAndFixResult {
  scan_summary: {
    vulnerability_type: string;
    files_scanned: number;
    instances_found: number;
  };
  findings: ScanAndFixFinding[];
  fixes_applied: number;
  fixes_failed: number;
}

interface ScanAndFixFinding {
  id: string;
  file_path: string;
  line_number: number;
  code_snippet: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  fixed: boolean;
  fixed_code?: string;
  error?: string;
}

/**
 * Build prompt for scanning a specific vulnerability type
 */
function buildScanForVulnTypePrompt(bug: Bug): string {
  const sections: string[] = [];
  const vulnType = bug.type || extractVulnType(bug.title) || 'security vulnerability';

  sections.push(`# Scan Project for ${vulnType}`);
  sections.push('');
  sections.push('## Original Reported Vulnerability');
  sections.push(`- **Title**: ${bug.title}`);
  sections.push(`- **Type**: ${vulnType}`);
  sections.push(`- **Severity**: ${bug.severity || 'Unknown'}`);
  if (bug.cweId) {
    sections.push(`- **CWE**: ${bug.cweId}`);
  }
  sections.push('');
  sections.push('## Description');
  sections.push(bug.description.substring(0, 500));
  sections.push('');

  // Get pattern info
  const pattern = getPatternsByType(vulnType);
  if (pattern) {
    sections.push('## Detection Patterns');
    sections.push('');
    sections.push(`**Category:** ${pattern.category}`);
    sections.push(`**CWE IDs:** ${pattern.cweIds.join(', ')}`);
    sections.push('');
    sections.push('**Search Patterns:**');
    pattern.searchPatterns.forEach(sp => {
      sections.push(`- ${sp.description}`);
      sections.push(`  Regex: \`${sp.regex}\``);
    });
    sections.push('');
    sections.push('**File Types:** ' + pattern.filePatterns.join(', '));
    sections.push('');
    if (pattern.antiPatterns && pattern.antiPatterns.length > 0) {
      sections.push('**Anti-Patterns (secure code - ignore these):**');
      pattern.antiPatterns.forEach(ap => sections.push(`- \`${ap}\``));
      sections.push('');
    }
  }

  // Add examples
  const examples = getVulnerabilityExamples(vulnType);
  if (examples) {
    sections.push('## Code Examples');
    sections.push('');
    sections.push('**Vulnerable (BAD):**');
    sections.push('```');
    examples.bad.forEach(ex => sections.push(ex));
    sections.push('```');
    sections.push('');
    sections.push('**Secure (GOOD):**');
    sections.push('```');
    examples.good.forEach(ex => sections.push(ex));
    sections.push('```');
    sections.push('');
  }

  sections.push('## Task');
  sections.push('');
  sections.push(`Scan the ENTIRE project for **${vulnType}** vulnerabilities.`);
  sections.push('');
  sections.push('1. Search all relevant files using the patterns above');
  sections.push('2. For each potential vulnerability found:');
  sections.push('   - Verify it\'s actually vulnerable (not a false positive)');
  sections.push('   - Check if anti-patterns exist nearby (secure implementation)');
  sections.push('   - Record file path, line number, and code snippet');
  sections.push('3. Assign severity based on exploitability');
  sections.push('');
  sections.push('## Output Format');
  sections.push('');
  sections.push('Return JSON:');
  sections.push('```json');
  sections.push('{');
  sections.push('  "scan_summary": {');
  sections.push(`    "vulnerability_type": "${vulnType}",`);
  sections.push('    "files_scanned": 50,');
  sections.push('    "instances_found": 3');
  sections.push('  },');
  sections.push('  "findings": [');
  sections.push('    {');
  sections.push('      "id": "1",');
  sections.push('      "file_path": "src/api/users.ts",');
  sections.push('      "line_number": 42,');
  sections.push('      "code_snippet": "vulnerable code here",');
  sections.push('      "severity": "high",');
  sections.push('      "context": "Why this is vulnerable"');
  sections.push('    }');
  sections.push('  ]');
  sections.push('}');
  sections.push('```');

  return sections.join('\n');
}

/**
 * Build prompt for fixing all found vulnerabilities
 */
function buildFixAllPrompt(bug: Bug, findings: ScanAndFixFinding[]): string {
  const sections: string[] = [];
  const vulnType = bug.type || extractVulnType(bug.title) || 'security vulnerability';

  sections.push(`# Fix All ${vulnType} Vulnerabilities`);
  sections.push('');
  sections.push(`Found ${findings.length} instances to fix.`);
  sections.push('');

  // Add examples for reference
  const examples = getVulnerabilityExamples(vulnType);
  if (examples) {
    sections.push('## Fix Pattern Reference');
    sections.push('');
    sections.push('**BAD → GOOD:**');
    sections.push('```');
    examples.bad.slice(0, 2).forEach((bad, i) => {
      sections.push(`// BAD:  ${bad}`);
      if (examples.good[i]) {
        sections.push(`// GOOD: ${examples.good[i]}`);
      }
      sections.push('');
    });
    sections.push('```');
    sections.push('');
    sections.push(`**Principle:** ${examples.explanation}`);
    sections.push('');
  }

  sections.push('## Vulnerabilities to Fix');
  sections.push('');

  findings.forEach((f, idx) => {
    sections.push(`### ${idx + 1}. ${f.file_path}:${f.line_number}`);
    sections.push('```');
    sections.push(f.code_snippet);
    sections.push('```');
    sections.push('');
  });

  sections.push('## Task');
  sections.push('');
  sections.push('Fix ALL the vulnerabilities listed above:');
  sections.push('');
  sections.push('1. Read each file');
  sections.push('2. Apply the secure fix pattern');
  sections.push('3. Preserve existing functionality');
  sections.push('4. Use the Edit tool to make changes');
  sections.push('');
  sections.push('## Output Format');
  sections.push('');
  sections.push('Return JSON with results:');
  sections.push('```json');
  sections.push('{');
  sections.push('  "fixes_applied": [');
  sections.push('    {');
  sections.push('      "file_path": "src/api/users.ts",');
  sections.push('      "line_number": 42,');
  sections.push('      "original_code": "vulnerable code",');
  sections.push('      "fixed_code": "secure code",');
  sections.push('      "success": true');
  sections.push('    }');
  sections.push('  ],');
  sections.push('  "summary": {');
  sections.push('    "total": 3,');
  sections.push('    "fixed": 3,');
  sections.push('    "failed": 0');
  sections.push('  }');
  sections.push('}');
  sections.push('```');

  return sections.join('\n');
}

/**
 * Extract vulnerability type from bug title
 */
function extractVulnType(title: string): string | null {
  const lowerTitle = title.toLowerCase();

  const typeMap: Record<string, string[]> = {
    'SQL Injection': ['sql injection', 'sqli', 'sql-injection'],
    'XSS': ['xss', 'cross-site scripting', 'cross site scripting'],
    'Command Injection': ['command injection', 'cmdi', 'os command', 'rce'],
    'Path Traversal': ['path traversal', 'directory traversal', 'lfi', 'local file'],
    'SSRF': ['ssrf', 'server-side request'],
    'IDOR': ['idor', 'insecure direct object'],
    'Hardcoded Secrets': ['hardcoded', 'hardcoded secret', 'api key', 'password in code'],
    'Missing Authentication': ['missing auth', 'no authentication', 'unauthenticated'],
    'Weak Cryptography': ['weak crypto', 'md5', 'sha1', 'weak hash'],
    'Open Redirect': ['open redirect', 'url redirect'],
    'XXE': ['xxe', 'xml external'],
    'Deserialization': ['deserialization', 'deserialize', 'pickle', 'unserialize'],
  };

  for (const [type, keywords] of Object.entries(typeMap)) {
    if (keywords.some(kw => lowerTitle.includes(kw))) {
      return type;
    }
  }

  return null;
}

/**
 * Register scan and fix all command
 */
export async function registerScanAndFixAllCommand(
  context: vscode.ExtensionContext,
  cliExecutor: ClaudeCodeCLIExecutor
): Promise<void> {
  context.subscriptions.push(
    vscode.commands.registerCommand('olivex.scanAndFixAll', async (bug: Bug) => {
      if (!bug) {
        vscode.window.showErrorMessage('No bug selected');
        return;
      }

      const isInstalled = await cliExecutor.isClaudeInstalled();
      if (!isInstalled) {
        vscode.window.showErrorMessage(
          'Claude Code CLI is not installed. Please install it from https://claude.ai/code'
        );
        return;
      }

      const vulnType = bug.type || extractVulnType(bug.title) || 'vulnerability';

      // Confirm with user
      const confirm = await vscode.window.showWarningMessage(
        `This will scan the entire project for "${vulnType}" vulnerabilities and offer to fix all instances. Continue?`,
        'Scan & Fix',
        'Cancel'
      );

      if (confirm !== 'Scan & Fix') {
        return;
      }

      await runScanAndFixAll(context, cliExecutor, bug);
    })
  );

  // Also register a quick version that just scans (no fix)
  context.subscriptions.push(
    vscode.commands.registerCommand('olivex.scanAllSimilar', async (bug: Bug) => {
      if (!bug) {
        vscode.window.showErrorMessage('No bug selected');
        return;
      }

      const isInstalled = await cliExecutor.isClaudeInstalled();
      if (!isInstalled) {
        vscode.window.showErrorMessage(
          'Claude Code CLI is not installed. Please install it from https://claude.ai/code'
        );
        return;
      }

      await runScanOnly(context, cliExecutor, bug);
    })
  );
}

/**
 * Run the full scan and fix workflow
 */
async function runScanAndFixAll(
  context: vscode.ExtensionContext,
  cliExecutor: ClaudeCodeCLIExecutor,
  bug: Bug
): Promise<void> {
  const vulnType = bug.type || extractVulnType(bug.title) || 'vulnerability';

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Scan & Fix: ${vulnType}`,
      cancellable: true,
    },
    async (progress, token) => {
      // Step 1: Scan for all instances
      progress.report({ message: 'Scanning project for vulnerabilities...', increment: 0 });

      const scanPrompt = buildScanForVulnTypePrompt(bug);

      let scanResult;
      try {
        scanResult = await cliExecutor.execute<{
          scan_summary: { vulnerability_type: string; files_scanned: number; instances_found: number };
          findings: Array<{
            id: string;
            file_path: string;
            line_number: number;
            code_snippet: string;
            severity: string;
            context?: string;
          }>;
        }>({
          prompt: scanPrompt,
          outputFormat: 'json',
          appendSystemPrompt: securitySystemPrompt,
          allowedTools: ['Read', 'Glob', 'Grep'],
          maxTurns: 20,
          timeout: 300000, // 5 minutes for scanning
        });
      } catch (error: any) {
        vscode.window.showErrorMessage(`Scan failed: ${error.message}`);
        return;
      }

      if (token.isCancellationRequested) {
        return;
      }

      if (!scanResult.success || !scanResult.output) {
        vscode.window.showErrorMessage(`Scan failed: ${scanResult.error || 'Unknown error'}`);
        return;
      }

      const findings = scanResult.output.findings || [];

      if (findings.length === 0) {
        vscode.window.showInformationMessage(
          `✅ No additional ${vulnType} vulnerabilities found in the project!`
        );
        return;
      }

      progress.report({
        message: `Found ${findings.length} instances. Preparing fixes...`,
        increment: 40
      });

      // Show findings and ask how to proceed
      const action = await vscode.window.showWarningMessage(
        `Found ${findings.length} ${vulnType} vulnerabilities. What would you like to do?`,
        'Fix All Automatically',
        'Review First',
        'Cancel'
      );

      if (action === 'Cancel' || !action) {
        return;
      }

      if (action === 'Review First') {
        // Show in scan results panel
        const scanResults = {
          scan_summary: {
            files_scanned: scanResult.output.scan_summary?.files_scanned || 0,
            total_findings: findings.length,
            patterns_checked: [vulnType],
          },
          similar_vulnerabilities: findings.map((f, idx) => ({
            id: f.id || `finding-${idx + 1}`,
            vulnerability_type: vulnType,
            file_path: f.file_path,
            line_numbers: [f.line_number],
            code_snippet: f.code_snippet,
            risk_level: (f.severity || 'medium') as 'critical' | 'high' | 'medium' | 'low',
            confidence: 'high' as const,
            matched_pattern: vulnType,
            context: f.context,
            recommendation: `Fix this ${vulnType} vulnerability`,
          })),
          recommendations: [`Fix all ${findings.length} instances of ${vulnType}`],
        };

        ScanResultsPanel.createOrShow(context.extensionUri, scanResults, `${vulnType} - ${findings.length} found`);

        // Offer to fix after review
        const fixAfterReview = await vscode.window.showInformationMessage(
          'Review the findings in the panel. Ready to fix all?',
          'Fix All Now',
          'Cancel'
        );

        if (fixAfterReview !== 'Fix All Now') {
          return;
        }
      }

      // Step 2: Fix all
      progress.report({ message: 'Applying fixes...', increment: 60 });

      const findingsToFix: ScanAndFixFinding[] = findings.map((f, idx) => ({
        id: f.id || `${idx + 1}`,
        file_path: f.file_path,
        line_number: f.line_number,
        code_snippet: f.code_snippet,
        severity: (f.severity || 'medium') as 'critical' | 'high' | 'medium' | 'low',
        fixed: false,
      }));

      const fixPrompt = buildFixAllPrompt(bug, findingsToFix);

      let fixResult;
      try {
        fixResult = await cliExecutor.execute<{
          fixes_applied: Array<{
            file_path: string;
            line_number: number;
            original_code: string;
            fixed_code: string;
            success: boolean;
            error?: string;
          }>;
          summary: {
            total: number;
            fixed: number;
            failed: number;
          };
        }>({
          prompt: fixPrompt,
          outputFormat: 'json',
          appendSystemPrompt: securitySystemPrompt,
          allowedTools: ['Read', 'Edit', 'Glob', 'Grep'],
          maxTurns: 30,
          timeout: 600000, // 10 minutes for fixing
        });
      } catch (error: any) {
        vscode.window.showErrorMessage(`Fix failed: ${error.message}`);
        return;
      }

      progress.report({ message: 'Complete!', increment: 100 });

      if (!fixResult.success || !fixResult.output) {
        vscode.window.showErrorMessage(`Fix failed: ${fixResult.error || 'Unknown error'}`);
        return;
      }

      const summary = fixResult.output.summary || {
        total: findings.length,
        fixed: fixResult.output.fixes_applied?.filter(f => f.success).length || 0,
        failed: fixResult.output.fixes_applied?.filter(f => !f.success).length || 0,
      };

      // Show result
      if (summary.failed === 0) {
        vscode.window.showInformationMessage(
          `✅ Fixed all ${summary.fixed} ${vulnType} vulnerabilities!`,
          'Show Changes'
        ).then(action => {
          if (action === 'Show Changes') {
            vscode.commands.executeCommand('git.openChange');
          }
        });
      } else {
        vscode.window.showWarningMessage(
          `Fixed ${summary.fixed}/${summary.total} vulnerabilities. ${summary.failed} failed.`,
          'View Details'
        );
      }
    }
  );
}

/**
 * Run scan only (no auto-fix)
 */
async function runScanOnly(
  context: vscode.ExtensionContext,
  cliExecutor: ClaudeCodeCLIExecutor,
  bug: Bug
): Promise<void> {
  const vulnType = bug.type || extractVulnType(bug.title) || 'vulnerability';

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Scanning for ${vulnType}...`,
      cancellable: true,
    },
    async (progress, token) => {
      const scanPrompt = buildScanForVulnTypePrompt(bug);

      const scanResult = await cliExecutor.execute<{
        scan_summary: { vulnerability_type: string; files_scanned: number; instances_found: number };
        findings: Array<{
          id: string;
          file_path: string;
          line_number: number;
          code_snippet: string;
          severity: string;
          context?: string;
        }>;
      }>({
        prompt: scanPrompt,
        outputFormat: 'json',
        appendSystemPrompt: securitySystemPrompt,
        allowedTools: ['Read', 'Glob', 'Grep'],
        maxTurns: 20,
        timeout: 300000,
      });

      if (token.isCancellationRequested) {
        return;
      }

      if (!scanResult.success || !scanResult.output) {
        vscode.window.showErrorMessage(`Scan failed: ${scanResult.error || 'Unknown error'}`);
        return;
      }

      const findings = scanResult.output.findings || [];

      if (findings.length === 0) {
        vscode.window.showInformationMessage(
          `✅ No additional ${vulnType} vulnerabilities found!`
        );
        return;
      }

      // Show in panel
      const scanResults = {
        scan_summary: {
          files_scanned: scanResult.output.scan_summary?.files_scanned || 0,
          total_findings: findings.length,
          patterns_checked: [vulnType],
        },
        similar_vulnerabilities: findings.map((f, idx) => ({
          id: f.id || `finding-${idx + 1}`,
          vulnerability_type: vulnType,
          file_path: f.file_path,
          line_numbers: [f.line_number],
          code_snippet: f.code_snippet,
          risk_level: (f.severity || 'medium') as 'critical' | 'high' | 'medium' | 'low',
          confidence: 'high' as const,
          matched_pattern: vulnType,
          context: f.context,
          recommendation: `Fix this ${vulnType} vulnerability`,
        })),
        recommendations: [`Found ${findings.length} instances of ${vulnType}`],
      };

      ScanResultsPanel.createOrShow(context.extensionUri, scanResults, `${vulnType} Scan Results`);

      vscode.window.showWarningMessage(
        `Found ${findings.length} ${vulnType} vulnerabilities`,
        'Fix All',
        'Dismiss'
      ).then(action => {
        if (action === 'Fix All') {
          vscode.commands.executeCommand('olivex.scanAndFixAll', bug);
        }
      });
    }
  );
}
