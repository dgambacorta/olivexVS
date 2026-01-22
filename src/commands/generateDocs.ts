import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ClaudeCodeCLIExecutor } from '../claude/cli-executor';
import { BugItem } from '../providers/bugTreeView';
import { buildDocPrompt, securitySystemPrompt } from '../claude/prompts/fix-prompt';
import { Bug } from '../types';

/**
 * Documentation result structure
 */
export interface DocResult {
  vulnerability_summary: {
    title: string;
    type: string;
    severity: string;
    cwe_id?: string;
    cvss_score?: number;
  };
  technical_details: {
    root_cause: string;
    attack_vector: string;
    affected_components: string[];
    impact: string;
  };
  fix_details: {
    approach: string;
    changes_made: string[];
    security_measures: string[];
  };
  timeline: {
    discovered: string;
    fixed: string;
  };
  prevention: {
    recommendations: string[];
    best_practices: string[];
  };
  markdown_content: string;
}

/**
 * Register the generateDocs command
 */
export async function registerGenerateDocsCommand(
  context: vscode.ExtensionContext,
  cliExecutor: ClaudeCodeCLIExecutor
): Promise<void> {
  context.subscriptions.push(
    vscode.commands.registerCommand('olivex.generateDocs', async (item?: BugItem | Bug, fixResult?: any) => {
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
        vscode.window.showErrorMessage(
          'Claude Code CLI is not installed. Please install it from https://claude.ai/code'
        );
        return;
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Generating documentation for: ${bug.title}`,
          cancellable: true,
        },
        async (progress, token) => {
          try {
            progress.report({ message: 'Building documentation context...' });

            // Build the prompt
            const prompt = buildDocPrompt(bug, fixResult);

            if (token.isCancellationRequested) {
              return;
            }

            progress.report({ message: 'Generating documentation with Claude...', increment: 20 });

            // Execute Claude Code CLI
            const result = await cliExecutor.execute<DocResult>({
              prompt,
              outputFormat: 'json',
              appendSystemPrompt: securitySystemPrompt,
              allowedTools: ['Read', 'Glob'],
              maxTurns: 5,
              timeout: 120000, // 2 minutes
            });

            if (token.isCancellationRequested) {
              return;
            }

            if (!result.success) {
              vscode.window.showErrorMessage(`Documentation generation failed: ${result.error}`);
              return;
            }

            progress.report({ message: 'Formatting documentation...', increment: 60 });

            // Generate markdown content
            const markdownContent = result.output?.markdown_content || generateMarkdownFromResult(bug, result.output);

            // Ask user where to save
            const saveOption = await vscode.window.showQuickPick(
              [
                { label: 'Open as new document', value: 'open' },
                { label: 'Save to .olivex/docs/', value: 'save' },
                { label: 'Copy to clipboard', value: 'clipboard' },
              ],
              { placeHolder: 'What would you like to do with the documentation?' }
            );

            if (!saveOption) {
              return;
            }

            switch (saveOption.value) {
              case 'open':
                const doc = await vscode.workspace.openTextDocument({
                  content: markdownContent,
                  language: 'markdown',
                });
                await vscode.window.showTextDocument(doc);
                break;

              case 'save':
                const workspaceFolders = vscode.workspace.workspaceFolders;
                if (!workspaceFolders) {
                  vscode.window.showErrorMessage('No workspace folder open');
                  return;
                }

                const docsDir = path.join(workspaceFolders[0].uri.fsPath, '.olivex', 'docs');
                await fs.mkdir(docsDir, { recursive: true });

                const sanitizedTitle = bug.title
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, '-')
                  .substring(0, 50);
                const fileName = `${sanitizedTitle}-${bug.id.substring(0, 8)}.md`;
                const filePath = path.join(docsDir, fileName);

                await fs.writeFile(filePath, markdownContent, 'utf-8');

                const savedDoc = await vscode.workspace.openTextDocument(filePath);
                await vscode.window.showTextDocument(savedDoc);

                vscode.window.showInformationMessage(`Documentation saved to ${fileName}`);
                break;

              case 'clipboard':
                await vscode.env.clipboard.writeText(markdownContent);
                vscode.window.showInformationMessage('Documentation copied to clipboard');
                break;
            }

            progress.report({ increment: 100 });

          } catch (error: any) {
            vscode.window.showErrorMessage(`Error generating documentation: ${error.message}`);
          }
        }
      );
    })
  );
}

/**
 * Generate markdown documentation from the result
 */
function generateMarkdownFromResult(bug: Bug, result: DocResult): string {
  const lines: string[] = [];

  // Header
  lines.push(`# Security Vulnerability Report`);
  lines.push('');
  lines.push(`## ${result?.vulnerability_summary?.title || bug.title}`);
  lines.push('');

  // Metadata table
  lines.push('| Field | Value |');
  lines.push('|-------|-------|');
  lines.push(`| **Severity** | ${bug.severity?.toUpperCase() || 'Unknown'} |`);
  lines.push(`| **Type** | ${result?.vulnerability_summary?.type || bug.type || 'Unknown'} |`);
  if (result?.vulnerability_summary?.cwe_id) {
    lines.push(`| **CWE ID** | ${result.vulnerability_summary.cwe_id} |`);
  }
  if (result?.vulnerability_summary?.cvss_score) {
    lines.push(`| **CVSS Score** | ${result.vulnerability_summary.cvss_score} |`);
  }
  lines.push(`| **Status** | ${bug.status || 'Under Review'} |`);
  lines.push('');

  // Technical Details
  if (result?.technical_details) {
    lines.push('## Technical Details');
    lines.push('');

    lines.push('### Root Cause');
    lines.push(result.technical_details.root_cause || 'See detailed analysis below.');
    lines.push('');

    lines.push('### Attack Vector');
    lines.push(result.technical_details.attack_vector || 'See detailed analysis below.');
    lines.push('');

    if (result.technical_details.affected_components?.length) {
      lines.push('### Affected Components');
      result.technical_details.affected_components.forEach((comp: string) => {
        lines.push(`- ${comp}`);
      });
      lines.push('');
    }

    lines.push('### Impact');
    lines.push(result.technical_details.impact || 'Potential security breach.');
    lines.push('');
  }

  // Fix Details
  if (result?.fix_details) {
    lines.push('## Fix Implementation');
    lines.push('');

    lines.push('### Approach');
    lines.push(result.fix_details.approach || 'See code changes below.');
    lines.push('');

    if (result.fix_details.changes_made?.length) {
      lines.push('### Changes Made');
      result.fix_details.changes_made.forEach((change: string) => {
        lines.push(`- ${change}`);
      });
      lines.push('');
    }

    if (result.fix_details.security_measures?.length) {
      lines.push('### Security Measures Added');
      result.fix_details.security_measures.forEach((measure: string) => {
        lines.push(`- ${measure}`);
      });
      lines.push('');
    }
  }

  // Prevention
  if (result?.prevention) {
    lines.push('## Prevention');
    lines.push('');

    if (result.prevention.recommendations?.length) {
      lines.push('### Recommendations');
      result.prevention.recommendations.forEach((rec: string) => {
        lines.push(`- ${rec}`);
      });
      lines.push('');
    }

    if (result.prevention.best_practices?.length) {
      lines.push('### Best Practices');
      result.prevention.best_practices.forEach((practice: string) => {
        lines.push(`- ${practice}`);
      });
      lines.push('');
    }
  }

  // Original Bug Details
  lines.push('## Original Report');
  lines.push('');

  if (bug.description) {
    lines.push('### Description');
    lines.push(bug.description);
    lines.push('');
  }

  if (bug.proofOfConcept) {
    lines.push('### Proof of Concept');
    lines.push('```');
    lines.push(bug.proofOfConcept);
    lines.push('```');
    lines.push('');
  }

  // Footer
  lines.push('---');
  lines.push('');
  lines.push(`*Generated by OliveX Security Extension on ${new Date().toISOString().split('T')[0]}*`);

  return lines.join('\n');
}
