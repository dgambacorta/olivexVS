import * as vscode from 'vscode';

/**
 * Status bar states
 */
export type StatusBarState =
  | 'idle'
  | 'scanning'
  | 'fixing'
  | 'generating'
  | 'syncing'
  | 'error'
  | 'success';

/**
 * Status bar configuration
 */
interface StatusBarConfig {
  state: StatusBarState;
  message?: string;
  tooltip?: string;
  command?: string;
  priority?: number;
}

/**
 * Manages the OliveX status bar items
 */
export class StatusBarService {
  private mainStatusBar: vscode.StatusBarItem;
  private syncStatusBar: vscode.StatusBarItem;
  private bugsStatusBar: vscode.StatusBarItem;
  private currentState: StatusBarState = 'idle';
  private disposables: vscode.Disposable[] = [];

  constructor() {
    // Main status bar item
    this.mainStatusBar = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    this.mainStatusBar.name = 'OliveX Status';

    // Sync status bar item
    this.syncStatusBar = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      99
    );
    this.syncStatusBar.name = 'OliveX Sync';

    // Bugs count status bar item
    this.bugsStatusBar = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      98
    );
    this.bugsStatusBar.name = 'OliveX Bugs';

    this.initialize();
  }

  private initialize(): void {
    this.setIdle();
    this.mainStatusBar.show();
  }

  /**
   * Set status bar to idle state
   */
  setIdle(message?: string): void {
    this.currentState = 'idle';
    this.mainStatusBar.text = '$(shield) OliveX';
    this.mainStatusBar.tooltip = message || 'OliveX Security - Click to open panel';
    this.mainStatusBar.command = 'olivex.refreshBugs';
    this.mainStatusBar.backgroundColor = undefined;
  }

  /**
   * Set status bar to scanning state
   */
  setScanning(message?: string): void {
    this.currentState = 'scanning';
    this.mainStatusBar.text = '$(sync~spin) OliveX: Scanning...';
    this.mainStatusBar.tooltip = message || 'Scanning codebase for vulnerabilities';
    this.mainStatusBar.command = 'olivex.showOutput';
    this.mainStatusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  }

  /**
   * Set status bar to fixing state
   */
  setFixing(bugTitle?: string): void {
    this.currentState = 'fixing';
    const title = bugTitle ? `: ${bugTitle.substring(0, 20)}...` : '';
    this.mainStatusBar.text = `$(tools) OliveX: Fixing${title}`;
    this.mainStatusBar.tooltip = bugTitle ? `Fixing: ${bugTitle}` : 'Applying security fix';
    this.mainStatusBar.command = 'olivex.showOutput';
    this.mainStatusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  }

  /**
   * Set status bar to generating state (tests, docs, etc.)
   */
  setGenerating(what: 'tests' | 'docs' | 'workflow'): void {
    this.currentState = 'generating';
    const labels: Record<string, string> = {
      tests: 'Generating Tests',
      docs: 'Generating Docs',
      workflow: 'Running Workflow',
    };
    this.mainStatusBar.text = `$(beaker) OliveX: ${labels[what]}...`;
    this.mainStatusBar.tooltip = `${labels[what]} in progress`;
    this.mainStatusBar.command = 'olivex.showOutput';
    this.mainStatusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  }

  /**
   * Set status bar to syncing state
   */
  setSyncing(count?: number): void {
    this.currentState = 'syncing';
    const countText = count ? ` (${count})` : '';
    this.mainStatusBar.text = `$(cloud-upload) OliveX: Syncing${countText}...`;
    this.mainStatusBar.tooltip = 'Syncing results with 0xHunter';
    this.mainStatusBar.command = 'olivex.showOutput';
    this.mainStatusBar.backgroundColor = undefined;
  }

  /**
   * Set status bar to error state
   */
  setError(message?: string): void {
    this.currentState = 'error';
    this.mainStatusBar.text = '$(warning) OliveX: Error';
    this.mainStatusBar.tooltip = message || 'An error occurred - click to view details';
    this.mainStatusBar.command = 'olivex.showOutput';
    this.mainStatusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');

    // Auto-reset after 5 seconds
    setTimeout(() => {
      if (this.currentState === 'error') {
        this.setIdle();
      }
    }, 5000);
  }

  /**
   * Set status bar to success state
   */
  setSuccess(message?: string): void {
    this.currentState = 'success';
    this.mainStatusBar.text = '$(check) OliveX: Done';
    this.mainStatusBar.tooltip = message || 'Operation completed successfully';
    this.mainStatusBar.command = 'olivex.refreshBugs';
    this.mainStatusBar.backgroundColor = undefined;

    // Auto-reset after 3 seconds
    setTimeout(() => {
      if (this.currentState === 'success') {
        this.setIdle();
      }
    }, 3000);
  }

  /**
   * Update bugs count display
   */
  updateBugsCount(count: number, bySeverity?: Record<string, number>): void {
    if (count === 0) {
      this.bugsStatusBar.hide();
      return;
    }

    let text = `$(bug) ${count}`;
    let tooltip = `${count} security issues`;

    if (bySeverity) {
      const parts: string[] = [];
      if (bySeverity.critical) parts.push(`${bySeverity.critical} critical`);
      if (bySeverity.high) parts.push(`${bySeverity.high} high`);
      if (bySeverity.medium) parts.push(`${bySeverity.medium} medium`);
      if (bySeverity.low) parts.push(`${bySeverity.low} low`);
      tooltip = parts.join(', ');

      // Show critical/high count in status bar
      const urgent = (bySeverity.critical || 0) + (bySeverity.high || 0);
      if (urgent > 0) {
        text = `$(bug) ${count} (${urgent} urgent)`;
      }
    }

    this.bugsStatusBar.text = text;
    this.bugsStatusBar.tooltip = tooltip;
    this.bugsStatusBar.command = 'olivexBugs.focus';
    this.bugsStatusBar.show();
  }

  /**
   * Update sync status display
   */
  updateSyncStatus(pendingCount: number): void {
    if (pendingCount === 0) {
      this.syncStatusBar.hide();
      return;
    }

    this.syncStatusBar.text = `$(cloud-upload) ${pendingCount}`;
    this.syncStatusBar.tooltip = `${pendingCount} items pending sync`;
    this.syncStatusBar.command = 'olivex.processSyncQueue';
    this.syncStatusBar.show();
  }

  /**
   * Show a temporary message
   */
  showTemporaryMessage(message: string, durationMs: number = 3000): void {
    const previousText = this.mainStatusBar.text;
    const previousTooltip = this.mainStatusBar.tooltip;
    const previousCommand = this.mainStatusBar.command;

    this.mainStatusBar.text = message;
    this.mainStatusBar.tooltip = undefined;
    this.mainStatusBar.command = undefined;

    setTimeout(() => {
      this.mainStatusBar.text = previousText;
      this.mainStatusBar.tooltip = previousTooltip;
      this.mainStatusBar.command = previousCommand;
    }, durationMs);
  }

  /**
   * Get current state
   */
  getState(): StatusBarState {
    return this.currentState;
  }

  /**
   * Create a progress indicator
   */
  createProgress(title: string): vscode.Progress<{ message?: string; increment?: number }> {
    // This is a simplified wrapper - real progress uses vscode.window.withProgress
    return {
      report: (value) => {
        if (value.message) {
          this.mainStatusBar.tooltip = `${title}: ${value.message}`;
        }
      },
    };
  }

  /**
   * Dispose all resources
   */
  dispose(): void {
    this.mainStatusBar.dispose();
    this.syncStatusBar.dispose();
    this.bugsStatusBar.dispose();
    this.disposables.forEach(d => d.dispose());
  }
}

// Singleton instance
let statusBarServiceInstance: StatusBarService | null = null;

export function getStatusBarService(): StatusBarService {
  if (!statusBarServiceInstance) {
    statusBarServiceInstance = new StatusBarService();
  }
  return statusBarServiceInstance;
}

export function disposeStatusBarService(): void {
  if (statusBarServiceInstance) {
    statusBarServiceInstance.dispose();
    statusBarServiceInstance = null;
  }
}
