import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { Bug, BugSeverity } from '../types';

export class ClaudeCodeBridge {
  private olivexDir: string;

  constructor(private workspaceRoot: string) {
    this.olivexDir = path.join(workspaceRoot, '.olivex');
  }

  /**
   * Initialize .olivex directory if it doesn't exist
   */
  private async ensureOlivexDir(): Promise<void> {
    try {
      await fs.access(this.olivexDir);
    } catch {
      await fs.mkdir(this.olivexDir, { recursive: true });
    }
  }

  /**
   * Format bug information for Claude Code consumption
   */
  private formatBugForClaude(bug: Bug): string {
    const sections: string[] = [];

    // Header
    sections.push('# Security Vulnerability Fix Request');
    sections.push('');
    sections.push(`**Bug ID:** ${bug.id}`);
    sections.push(`**Severity:** ${(bug.severity || 'Unknown').toUpperCase()} ${this.getSeverityEmoji(bug.severity || '')}`);
    sections.push(`**Status:** ${bug.status}`);
    if (bug.cvssScore) {
      sections.push(`**CVSS Score:** ${bug.cvssScore}`);
    }
    if (bug.cweId) {
      sections.push(`**CWE:** ${bug.cweId}`);
    }
    sections.push('');

    // Title and Description
    sections.push(`## ${bug.title}`);
    sections.push('');
    sections.push('### Description');
    sections.push(bug.description);
    sections.push('');

    // Location Information
    if (bug.affectedFile || bug.affectedUrl) {
      sections.push('### Affected Location');
      if (bug.affectedFile) {
        sections.push(`**File:** \`${bug.affectedFile}\``);
        if (bug.affectedLines) {
          sections.push(`**Lines:** ${bug.affectedLines[0]}-${bug.affectedLines[1]}`);
        }
      }
      if (bug.affectedUrl) {
        sections.push(`**URL:** ${bug.affectedUrl}`);
      }
      sections.push('');
    }

    // Proof of Concept
    if (bug.proofOfConcept) {
      sections.push('### Proof of Concept');
      sections.push('```');
      sections.push(bug.proofOfConcept);
      sections.push('```');
      sections.push('');
    }

    // Recommendation
    if (bug.recommendation) {
      sections.push('### Recommended Fix');
      sections.push(bug.recommendation);
      sections.push('');
    }

    // Additional Context
    if (bug.tags && typeof bug.tags === 'string') {
      sections.push('### Tags');
      sections.push(bug.tags);
      sections.push('');
    }

    // Instructions for Claude Code
    sections.push('---');
    sections.push('');
    sections.push('## Instructions for Claude Code');
    sections.push('');
    sections.push('Please analyze this security vulnerability and:');
    sections.push('');
    sections.push('1. **Locate the vulnerable code** in the codebase');
    sections.push('2. **Analyze the security issue** and understand the attack vector');
    sections.push('3. **Implement a secure fix** that:');
    sections.push('   - Eliminates the vulnerability completely');
    sections.push('   - Follows security best practices');
    sections.push('   - Maintains existing functionality');
    sections.push('   - Does not introduce new issues');
    sections.push('4. **Add security tests** to verify the fix and prevent regression');
    sections.push('5. **Document the changes** with clear comments explaining the security improvement');
    sections.push('');
    sections.push('### Security Checklist');
    sections.push('- [ ] Vulnerability is completely mitigated');
    sections.push('- [ ] No new security issues introduced');
    sections.push('- [ ] Input validation is properly implemented');
    sections.push('- [ ] Output encoding/escaping is correct');
    sections.push('- [ ] Authentication/authorization checks are in place (if applicable)');
    sections.push('- [ ] Security tests are added');
    sections.push('- [ ] Code follows secure coding standards');
    sections.push('');

    if (bug.affectedFile) {
      sections.push(`**Primary file to fix:** \`${bug.affectedFile}\``);
      sections.push('');
    }

    return sections.join('\n');
  }

  /**
   * Get emoji for severity level
   */
  private getSeverityEmoji(severity: string): string {
    const emojiMap: Record<string, string> = {
      'critical': '🔴',
      'high': '🟠',
      'medium': '🟡',
      'low': '🟢',
      'info': '🔵',
    };
    return emojiMap[severity.toLowerCase()] || '⚪';
  }

  /**
   * Create a bug context file for Claude Code
   */
  async createBugContextFile(bug: Bug): Promise<string> {
    await this.ensureOlivexDir();

    const fileName = `bug-${bug.id}.md`;
    const filePath = path.join(this.olivexDir, fileName);
    const content = this.formatBugForClaude(bug);

    await fs.writeFile(filePath, content, 'utf-8');

    return filePath;
  }

  /**
   * Fix bug using Claude Code
   */
  async fixBug(bug: Bug): Promise<void> {
    try {
      // Create context file
      const contextFile = await this.createBugContextFile(bug);
      const relativePath = path.relative(this.workspaceRoot, contextFile);

      // Create or show terminal
      let terminal = this.findOlivexTerminal();
      if (!terminal) {
        terminal = vscode.window.createTerminal({
          name: 'OliveX Security Fix',
          cwd: this.workspaceRoot,
        });
      }
      terminal.show();

      // Build Claude Code command
      const prompt = `Fix the security vulnerability described in ${relativePath}`;
      
      // Send command to terminal
      terminal.sendText(`claude-code "${prompt}"`);

      // Show notification
      vscode.window.showInformationMessage(
        `🛠️ Claude Code is analyzing bug: ${bug.title}`,
        'View Context'
      ).then(selection => {
        if (selection === 'View Context') {
          vscode.workspace.openTextDocument(contextFile).then(doc => {
            vscode.window.showTextDocument(doc);
          });
        }
      });

    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to initiate fix: ${error.message}`);
      throw error;
    }
  }

  /**
   * Find existing OliveX terminal
   */
  private findOlivexTerminal(): vscode.Terminal | undefined {
    return vscode.window.terminals.find(t => t.name === 'OliveX Security Fix');
  }

  /**
   * Clean up old context files
   */
  async cleanupOldContextFiles(keepLatest: number = 10): Promise<void> {
    try {
      await this.ensureOlivexDir();
      const files = await fs.readdir(this.olivexDir);
      const bugFiles = files
        .filter(f => f.startsWith('bug-') && f.endsWith('.md'))
        .map(f => path.join(this.olivexDir, f));

      if (bugFiles.length <= keepLatest) {
        return;
      }

      // Sort by modification time
      const fileStats = await Promise.all(
        bugFiles.map(async f => ({
          path: f,
          mtime: (await fs.stat(f)).mtime,
        }))
      );

      fileStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

      // Delete old files
      const filesToDelete = fileStats.slice(keepLatest);
      await Promise.all(filesToDelete.map(f => fs.unlink(f.path)));

    } catch (error) {
      console.error('Failed to cleanup context files:', error);
    }
  }

  /**
   * Open bug context file in editor
   */
  async openBugContext(bug: Bug): Promise<void> {
    const contextFile = await this.createBugContextFile(bug);
    const doc = await vscode.workspace.openTextDocument(contextFile);
    await vscode.window.showTextDocument(doc, { preview: false });
  }
}
