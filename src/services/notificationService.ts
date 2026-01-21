import * as vscode from 'vscode';

/**
 * Error types for categorization
 */
export enum ErrorType {
  NETWORK = 'network',
  AUTH = 'auth',
  CLI_NOT_INSTALLED = 'cli_not_installed',
  CLI_EXECUTION = 'cli_execution',
  TIMEOUT = 'timeout',
  PARSE_ERROR = 'parse_error',
  FILE_NOT_FOUND = 'file_not_found',
  PERMISSION_DENIED = 'permission_denied',
  VALIDATION = 'validation',
  UNKNOWN = 'unknown',
}

/**
 * Structured error for better handling
 */
export interface OliveXError {
  type: ErrorType;
  message: string;
  details?: string;
  recoverable: boolean;
  suggestedAction?: string;
  originalError?: Error;
}

/**
 * Notification service for consistent error handling and user notifications
 */
export class NotificationService {
  private outputChannel: vscode.OutputChannel;
  private statusBarItem: vscode.StatusBarItem;
  private errorLog: OliveXError[] = [];

  constructor() {
    this.outputChannel = vscode.window.createOutputChannel('OliveX Security');
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.statusBarItem.command = 'olivex.showOutput';
  }

  /**
   * Log an error and show appropriate notification
   */
  async handleError(error: OliveXError | Error | string, showNotification: boolean = true): Promise<void> {
    const olivexError = this.normalizeError(error);
    this.errorLog.push(olivexError);
    this.logToChannel(olivexError);

    if (showNotification) {
      await this.showErrorNotification(olivexError);
    }
  }

  /**
   * Normalize various error types to OliveXError
   */
  private normalizeError(error: OliveXError | Error | string): OliveXError {
    if (typeof error === 'string') {
      return {
        type: ErrorType.UNKNOWN,
        message: error,
        recoverable: true,
      };
    }

    if ('type' in error && 'message' in error && 'recoverable' in error) {
      return error as OliveXError;
    }

    // Parse common error patterns
    const err = error as Error;
    const message = err.message || 'Unknown error';

    // Detect error type from message
    if (message.includes('ENOTFOUND') || message.includes('network') || message.includes('fetch')) {
      return {
        type: ErrorType.NETWORK,
        message: 'Network connection error',
        details: message,
        recoverable: true,
        suggestedAction: 'Check your internet connection and try again',
        originalError: err,
      };
    }

    if (message.includes('401') || message.includes('403') || message.includes('unauthorized') || message.includes('authentication')) {
      return {
        type: ErrorType.AUTH,
        message: 'Authentication failed',
        details: message,
        recoverable: true,
        suggestedAction: 'Check your credentials in the extension settings',
        originalError: err,
      };
    }

    if (message.includes('timeout') || message.includes('ETIMEDOUT')) {
      return {
        type: ErrorType.TIMEOUT,
        message: 'Operation timed out',
        details: message,
        recoverable: true,
        suggestedAction: 'Try again or increase the timeout in settings',
        originalError: err,
      };
    }

    if (message.includes('Claude Code CLI') || message.includes('not installed')) {
      return {
        type: ErrorType.CLI_NOT_INSTALLED,
        message: 'Claude Code CLI is not installed',
        details: message,
        recoverable: true,
        suggestedAction: 'Install Claude Code CLI from https://claude.ai/code',
        originalError: err,
      };
    }

    if (message.includes('JSON') || message.includes('parse') || message.includes('syntax')) {
      return {
        type: ErrorType.PARSE_ERROR,
        message: 'Failed to parse response',
        details: message,
        recoverable: true,
        suggestedAction: 'The AI response was malformed. Try again.',
        originalError: err,
      };
    }

    if (message.includes('ENOENT') || message.includes('not found') || message.includes('does not exist')) {
      return {
        type: ErrorType.FILE_NOT_FOUND,
        message: 'File or resource not found',
        details: message,
        recoverable: true,
        suggestedAction: 'Verify the file path exists',
        originalError: err,
      };
    }

    if (message.includes('EACCES') || message.includes('permission')) {
      return {
        type: ErrorType.PERMISSION_DENIED,
        message: 'Permission denied',
        details: message,
        recoverable: false,
        suggestedAction: 'Check file permissions',
        originalError: err,
      };
    }

    return {
      type: ErrorType.UNKNOWN,
      message: message,
      recoverable: true,
      originalError: err,
    };
  }

  /**
   * Show appropriate error notification based on error type
   */
  private async showErrorNotification(error: OliveXError): Promise<void> {
    const actions: string[] = ['Show Details'];

    // Add suggested action button if available
    if (error.suggestedAction) {
      switch (error.type) {
        case ErrorType.CLI_NOT_INSTALLED:
          actions.push('Install CLI');
          break;
        case ErrorType.AUTH:
          actions.push('Configure');
          break;
        case ErrorType.NETWORK:
        case ErrorType.TIMEOUT:
          actions.push('Retry');
          break;
      }
    }

    const selection = await vscode.window.showErrorMessage(
      `OliveX: ${error.message}`,
      ...actions
    );

    if (selection === 'Show Details') {
      this.outputChannel.show();
    } else if (selection === 'Install CLI') {
      vscode.env.openExternal(vscode.Uri.parse('https://claude.ai/code'));
    } else if (selection === 'Configure') {
      vscode.commands.executeCommand('olivex.configure');
    }
  }

  /**
   * Log error to output channel
   */
  private logToChannel(error: OliveXError): void {
    const timestamp = new Date().toISOString();
    this.outputChannel.appendLine(`\n[${timestamp}] ERROR: ${error.type.toUpperCase()}`);
    this.outputChannel.appendLine(`Message: ${error.message}`);
    if (error.details) {
      this.outputChannel.appendLine(`Details: ${error.details}`);
    }
    if (error.suggestedAction) {
      this.outputChannel.appendLine(`Suggested Action: ${error.suggestedAction}`);
    }
    if (error.originalError?.stack) {
      this.outputChannel.appendLine(`Stack: ${error.originalError.stack}`);
    }
    this.outputChannel.appendLine('---');
  }

  /**
   * Show success notification
   */
  showSuccess(message: string, actions?: string[]): Thenable<string | undefined> {
    return vscode.window.showInformationMessage(`OliveX: ${message}`, ...(actions || []));
  }

  /**
   * Show warning notification
   */
  showWarning(message: string, actions?: string[]): Thenable<string | undefined> {
    return vscode.window.showWarningMessage(`OliveX: ${message}`, ...(actions || []));
  }

  /**
   * Show info notification
   */
  showInfo(message: string, actions?: string[]): Thenable<string | undefined> {
    return vscode.window.showInformationMessage(message, ...(actions || []));
  }

  /**
   * Update status bar with current state
   */
  updateStatusBar(state: 'idle' | 'scanning' | 'fixing' | 'error', message?: string): void {
    const icons: Record<string, string> = {
      idle: '$(shield)',
      scanning: '$(sync~spin)',
      fixing: '$(tools)',
      error: '$(warning)',
    };

    this.statusBarItem.text = `${icons[state]} OliveX`;
    this.statusBarItem.tooltip = message || 'OliveX Security';

    if (state === 'error') {
      this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    } else if (state === 'scanning' || state === 'fixing') {
      this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else {
      this.statusBarItem.backgroundColor = undefined;
    }

    this.statusBarItem.show();
  }

  /**
   * Show progress in status bar
   */
  showProgress(message: string): void {
    this.updateStatusBar('scanning', message);
  }

  /**
   * Reset status bar to idle
   */
  resetStatusBar(): void {
    this.updateStatusBar('idle', 'OliveX Security - Ready');
  }

  /**
   * Log info message
   */
  log(message: string): void {
    const timestamp = new Date().toISOString();
    this.outputChannel.appendLine(`[${timestamp}] ${message}`);
  }

  /**
   * Show output channel
   */
  showOutput(): void {
    this.outputChannel.show();
  }

  /**
   * Get error log
   */
  getErrorLog(): OliveXError[] {
    return [...this.errorLog];
  }

  /**
   * Clear error log
   */
  clearErrorLog(): void {
    this.errorLog = [];
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.outputChannel.dispose();
    this.statusBarItem.dispose();
  }
}

// Singleton instance
let notificationServiceInstance: NotificationService | null = null;

export function getNotificationService(): NotificationService {
  if (!notificationServiceInstance) {
    notificationServiceInstance = new NotificationService();
  }
  return notificationServiceInstance;
}

export function disposeNotificationService(): void {
  if (notificationServiceInstance) {
    notificationServiceInstance.dispose();
    notificationServiceInstance = null;
  }
}
