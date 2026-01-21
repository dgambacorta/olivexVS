import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * Options for executing Claude Code CLI
 */
export interface CLIExecutionOptions {
  prompt: string;
  workingDir?: string;
  outputFormat?: 'text' | 'json' | 'stream-json';
  jsonSchema?: object;
  allowedTools?: string[];
  appendSystemPrompt?: string;
  sessionId?: string;
  resume?: boolean;
  timeout?: number;
  maxTurns?: number;
}

/**
 * Result from Claude Code CLI execution
 */
export interface CLIExecutionResult<T = any> {
  success: boolean;
  output: T;
  rawOutput: string;
  sessionId?: string;
  error?: string;
  cost?: number;
}

/**
 * Fix result structure from Claude Code
 */
export interface FixResult {
  success: boolean;
  vulnerability_analysis: {
    root_cause: string;
    attack_vector: string;
    impact_assessment?: string;
  };
  fix: {
    file_path: string;
    original_code?: string;
    fixed_code: string;
    explanation: string;
    security_measures_added: string[];
  };
  verification_steps?: string[];
  additional_recommendations?: string[];
}

/**
 * Claude Code CLI Executor
 * Wraps the Claude Code CLI for programmatic execution
 */
export class ClaudeCodeCLIExecutor {
  private claudeBinaryPath: string = 'claude';
  private workspaceRoot: string;
  private outputChannel: vscode.OutputChannel;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.outputChannel = vscode.window.createOutputChannel('OliveX Claude Code');
  }

  /**
   * Check if Claude Code CLI is installed and available
   */
  async isClaudeInstalled(): Promise<boolean> {
    return new Promise((resolve) => {
      cp.exec('claude --version', (error) => {
        resolve(!error);
      });
    });
  }

  /**
   * Get Claude Code CLI version
   */
  async getClaudeVersion(): Promise<string | null> {
    return new Promise((resolve) => {
      cp.exec('claude --version', (error, stdout) => {
        if (error) {
          resolve(null);
        } else {
          resolve(stdout.trim());
        }
      });
    });
  }

  /**
   * Execute Claude Code CLI with the given options
   */
  async execute<T = any>(options: CLIExecutionOptions): Promise<CLIExecutionResult<T>> {
    // Check if Claude is installed
    const isInstalled = await this.isClaudeInstalled();
    if (!isInstalled) {
      return {
        success: false,
        output: null as T,
        rawOutput: '',
        error: 'Claude Code CLI is not installed. Please install it from https://claude.ai/code'
      };
    }

    const args = this.buildCommandArgs(options);
    const workingDir = options.workingDir || this.workspaceRoot;

    this.outputChannel.appendLine(`\n[${new Date().toISOString()}] Executing Claude Code CLI`);
    this.outputChannel.appendLine(`Working directory: ${workingDir}`);
    this.outputChannel.appendLine(`Command: claude ${args.join(' ')}`);
    this.outputChannel.appendLine(`Prompt length: ${options.prompt.length} chars`);

    return new Promise((resolve) => {
      const timeout = options.timeout || 120000; // 2 minutes default

      // Handle large prompts by writing to a temp file
      this.executeWithPrompt(args, options.prompt, workingDir, timeout)
        .then((result) => {
          if (options.outputFormat === 'json' && result.success) {
            try {
              const parsed = this.parseJsonOutput<T>(result.rawOutput);
              resolve({
                ...result,
                output: parsed.output,
                sessionId: parsed.sessionId
              });
            } catch (parseError: any) {
              this.outputChannel.appendLine(`JSON parse error: ${parseError.message}`);
              resolve({
                success: false,
                output: null as T,
                rawOutput: result.rawOutput,
                error: `Failed to parse JSON output: ${parseError.message}`
              });
            }
          } else {
            resolve(result as CLIExecutionResult<T>);
          }
        })
        .catch((error) => {
          this.outputChannel.appendLine(`Execution error: ${error.message}`);
          resolve({
            success: false,
            output: null as T,
            rawOutput: '',
            error: error.message
          });
        });
    });
  }

  /**
   * Execute with prompt, handling large inputs
   */
  private async executeWithPrompt(
    args: string[],
    prompt: string,
    workingDir: string,
    timeout: number
  ): Promise<CLIExecutionResult> {
    // For large prompts, write to a temp file and reference it
    if (prompt.length > 6000) {
      return this.executeWithPromptFile(args, prompt, workingDir, timeout);
    }

    return this.executeDirectly(args, prompt, workingDir, timeout);
  }

  /**
   * Execute directly with prompt as argument
   */
  private executeDirectly(
    args: string[],
    prompt: string,
    workingDir: string,
    timeout: number
  ): Promise<CLIExecutionResult> {
    return new Promise((resolve) => {
      // Add prompt to args
      const fullArgs = [...args, prompt];

      const childProcess = cp.spawn(this.claudeBinaryPath, fullArgs, {
        cwd: workingDir,
        shell: true,
        env: { ...process.env }
      });

      let stdout = '';
      let stderr = '';

      childProcess.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
        this.outputChannel.append(data.toString());
      });

      childProcess.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
        this.outputChannel.append(`[stderr] ${data.toString()}`);
      });

      const timeoutId = setTimeout(() => {
        childProcess.kill('SIGTERM');
        resolve({
          success: false,
          output: null,
          rawOutput: stdout,
          error: `Execution timed out after ${timeout / 1000} seconds`
        });
      }, timeout);

      childProcess.on('close', (code: number | null) => {
        clearTimeout(timeoutId);
        this.outputChannel.appendLine(`\nProcess exited with code: ${code}`);

        if (code === 0) {
          resolve({
            success: true,
            output: stdout,
            rawOutput: stdout
          });
        } else {
          resolve({
            success: false,
            output: null,
            rawOutput: stdout,
            error: stderr || `Process exited with code ${code}`
          });
        }
      });

      childProcess.on('error', (error: Error) => {
        clearTimeout(timeoutId);
        resolve({
          success: false,
          output: null,
          rawOutput: '',
          error: error.message
        });
      });
    });
  }

  /**
   * Execute with prompt written to a temp file (for large prompts)
   */
  private async executeWithPromptFile(
    args: string[],
    prompt: string,
    workingDir: string,
    timeout: number
  ): Promise<CLIExecutionResult> {
    const tempDir = path.join(this.workspaceRoot, '.olivex', 'temp');
    await fs.mkdir(tempDir, { recursive: true });

    const tempFile = path.join(tempDir, `prompt-${Date.now()}.md`);
    await fs.writeFile(tempFile, prompt, 'utf-8');

    this.outputChannel.appendLine(`Large prompt written to: ${tempFile}`);

    try {
      // Reference the file in the prompt
      const filePrompt = `Please read and follow the instructions in @${tempFile}`;
      const result = await this.executeDirectly(args, filePrompt, workingDir, timeout);

      // Cleanup temp file
      await fs.unlink(tempFile).catch(() => {});

      return result;
    } catch (error) {
      await fs.unlink(tempFile).catch(() => {});
      throw error;
    }
  }

  /**
   * Build command line arguments
   */
  private buildCommandArgs(options: CLIExecutionOptions): string[] {
    const args: string[] = ['-p']; // Print/headless mode

    // Output format
    if (options.outputFormat) {
      args.push('--output-format', options.outputFormat);
    }

    // JSON schema
    if (options.jsonSchema && options.outputFormat === 'json') {
      const schemaStr = JSON.stringify(options.jsonSchema);
      args.push('--output-format', 'json');
    }

    // Allowed tools
    if (options.allowedTools && options.allowedTools.length > 0) {
      args.push('--allowedTools', options.allowedTools.join(','));
    }

    // System prompt
    if (options.appendSystemPrompt) {
      args.push('--append-system-prompt', `"${options.appendSystemPrompt.replace(/"/g, '\\"')}"`);
    }

    // Session resume
    if (options.resume && options.sessionId) {
      args.push('--resume', options.sessionId);
    }

    // Max turns
    if (options.maxTurns) {
      args.push('--max-turns', options.maxTurns.toString());
    }

    return args;
  }

  /**
   * Parse JSON output from Claude Code
   */
  private parseJsonOutput<T>(output: string): { output: T; sessionId?: string } {
    // Try to extract JSON from the output
    const jsonMatch = output.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON object found in output');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Extract session ID if present
    const sessionId = parsed.session_id || parsed.sessionId;

    return {
      output: parsed as T,
      sessionId
    };
  }

  /**
   * Execute a fix workflow for a vulnerability
   */
  async executeFix(
    prompt: string,
    systemPrompt: string,
    options?: Partial<CLIExecutionOptions>
  ): Promise<CLIExecutionResult<FixResult>> {
    const fixOptions: CLIExecutionOptions = {
      prompt,
      outputFormat: 'json',
      allowedTools: ['Read', 'Edit', 'Glob', 'Grep'],
      appendSystemPrompt: systemPrompt,
      maxTurns: 10,
      timeout: 180000, // 3 minutes for fix operations
      ...options
    };

    return this.execute<FixResult>(fixOptions);
  }

  /**
   * Resume a session for multi-step workflows
   */
  async resumeSession<T = any>(
    sessionId: string,
    prompt: string,
    options?: Partial<CLIExecutionOptions>
  ): Promise<CLIExecutionResult<T>> {
    return this.execute<T>({
      prompt,
      sessionId,
      resume: true,
      ...options
    });
  }

  /**
   * Open interactive Claude Code session in terminal
   */
  async openInteractiveSession(contextPrompt?: string): Promise<void> {
    const terminal = vscode.window.createTerminal({
      name: 'Claude Code - OliveX',
      cwd: this.workspaceRoot
    });

    terminal.show();

    if (contextPrompt) {
      // Write context to clipboard for easy pasting
      await vscode.env.clipboard.writeText(contextPrompt);
      terminal.sendText('claude');
      vscode.window.showInformationMessage(
        'Claude Code opened. Paste (Cmd+V) the vulnerability context to start.',
        'Got it'
      );
    } else {
      terminal.sendText('claude');
    }
  }

  /**
   * Show output channel
   */
  showOutput(): void {
    this.outputChannel.show();
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.outputChannel.dispose();
  }
}
