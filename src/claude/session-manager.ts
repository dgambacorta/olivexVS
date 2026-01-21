import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Bug } from '../types';
import { FixResult, ClaudeCodeCLIExecutor } from './cli-executor';

/**
 * Workflow step types
 */
export type WorkflowStepType = 'scan' | 'fix' | 'test' | 'document';

/**
 * Status of a workflow step
 */
export type WorkflowStepStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';

/**
 * Individual workflow step
 */
export interface WorkflowStep {
  name: WorkflowStepType;
  status: WorkflowStepStatus;
  sessionId?: string;
  result?: any;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

/**
 * Complete workflow session
 */
export interface WorkflowSession {
  id: string;
  bugId: string;
  bugTitle: string;
  steps: WorkflowStep[];
  currentStepIndex: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  createdAt: Date;
  updatedAt: Date;
  claudeSessionId?: string;
}

/**
 * Event emitted when workflow state changes
 */
export interface WorkflowStateChangeEvent {
  session: WorkflowSession;
  step?: WorkflowStep;
  type: 'started' | 'step_started' | 'step_completed' | 'step_failed' | 'completed' | 'failed' | 'cancelled';
}

/**
 * Manages multi-step security workflows
 */
export class SessionManager {
  private sessions: Map<string, WorkflowSession> = new Map();
  private storageDir: string;
  private _onStateChange = new vscode.EventEmitter<WorkflowStateChangeEvent>();
  public readonly onStateChange = this._onStateChange.event;

  constructor(
    private context: vscode.ExtensionContext,
    private workspaceRoot: string
  ) {
    this.storageDir = path.join(workspaceRoot, '.olivex', 'sessions');
    this.loadSessions();
  }

  /**
   * Load saved sessions from disk
   */
  private async loadSessions(): Promise<void> {
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
      const files = await fs.readdir(this.storageDir);

      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const content = await fs.readFile(path.join(this.storageDir, file), 'utf-8');
            const session = JSON.parse(content) as WorkflowSession;
            // Convert date strings back to Date objects
            session.createdAt = new Date(session.createdAt);
            session.updatedAt = new Date(session.updatedAt);
            session.steps.forEach(step => {
              if (step.startedAt) step.startedAt = new Date(step.startedAt);
              if (step.completedAt) step.completedAt = new Date(step.completedAt);
            });
            this.sessions.set(session.id, session);
          } catch (e) {
            console.error(`Failed to load session from ${file}:`, e);
          }
        }
      }
    } catch (e) {
      console.error('Failed to load sessions:', e);
    }
  }

  /**
   * Save a session to disk
   */
  private async saveSession(session: WorkflowSession): Promise<void> {
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
      const filePath = path.join(this.storageDir, `${session.id}.json`);
      await fs.writeFile(filePath, JSON.stringify(session, null, 2), 'utf-8');
    } catch (e) {
      console.error('Failed to save session:', e);
    }
  }

  /**
   * Delete a session from disk
   */
  private async deleteSessionFile(sessionId: string): Promise<void> {
    try {
      const filePath = path.join(this.storageDir, `${sessionId}.json`);
      await fs.unlink(filePath);
    } catch (e) {
      // Ignore if file doesn't exist
    }
  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    return `ws-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Create a new workflow session
   */
  createSession(bug: Bug, stepTypes: WorkflowStepType[]): WorkflowSession {
    const session: WorkflowSession = {
      id: this.generateSessionId(),
      bugId: bug.id,
      bugTitle: bug.title,
      steps: stepTypes.map(name => ({
        name,
        status: 'pending' as WorkflowStepStatus,
      })),
      currentStepIndex: 0,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.sessions.set(session.id, session);
    this.saveSession(session);

    return session;
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): WorkflowSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all sessions for a bug
   */
  getSessionsForBug(bugId: string): WorkflowSession[] {
    return Array.from(this.sessions.values())
      .filter(s => s.bugId === bugId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Get all active (in_progress) sessions
   */
  getActiveSessions(): WorkflowSession[] {
    return Array.from(this.sessions.values())
      .filter(s => s.status === 'in_progress');
  }

  /**
   * Start a workflow session
   */
  startSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    session.status = 'in_progress';
    session.updatedAt = new Date();
    this.saveSession(session);

    this._onStateChange.fire({
      session,
      type: 'started',
    });
  }

  /**
   * Start a specific step in a session
   */
  startStep(sessionId: string, stepIndex: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const step = session.steps[stepIndex];
    if (!step) {
      throw new Error(`Step ${stepIndex} not found in session ${sessionId}`);
    }

    step.status = 'in_progress';
    step.startedAt = new Date();
    session.currentStepIndex = stepIndex;
    session.updatedAt = new Date();
    this.saveSession(session);

    this._onStateChange.fire({
      session,
      step,
      type: 'step_started',
    });
  }

  /**
   * Complete a step with a result
   */
  completeStep(sessionId: string, stepIndex: number, result: any, claudeSessionId?: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const step = session.steps[stepIndex];
    if (!step) {
      throw new Error(`Step ${stepIndex} not found in session ${sessionId}`);
    }

    step.status = 'completed';
    step.result = result;
    step.completedAt = new Date();
    if (claudeSessionId) {
      step.sessionId = claudeSessionId;
      session.claudeSessionId = claudeSessionId;
    }
    session.updatedAt = new Date();

    // Check if all steps are completed
    const allCompleted = session.steps.every(s =>
      s.status === 'completed' || s.status === 'skipped'
    );
    if (allCompleted) {
      session.status = 'completed';
    }

    this.saveSession(session);

    this._onStateChange.fire({
      session,
      step,
      type: allCompleted ? 'completed' : 'step_completed',
    });
  }

  /**
   * Fail a step with an error
   */
  failStep(sessionId: string, stepIndex: number, error: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const step = session.steps[stepIndex];
    if (!step) {
      throw new Error(`Step ${stepIndex} not found in session ${sessionId}`);
    }

    step.status = 'failed';
    step.error = error;
    step.completedAt = new Date();
    session.status = 'failed';
    session.updatedAt = new Date();
    this.saveSession(session);

    this._onStateChange.fire({
      session,
      step,
      type: 'step_failed',
    });
  }

  /**
   * Skip a step
   */
  skipStep(sessionId: string, stepIndex: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const step = session.steps[stepIndex];
    if (!step) {
      throw new Error(`Step ${stepIndex} not found in session ${sessionId}`);
    }

    step.status = 'skipped';
    session.updatedAt = new Date();
    this.saveSession(session);
  }

  /**
   * Cancel a session
   */
  cancelSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    session.status = 'cancelled';
    session.updatedAt = new Date();
    this.saveSession(session);

    this._onStateChange.fire({
      session,
      type: 'cancelled',
    });
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
    await this.deleteSessionFile(sessionId);
  }

  /**
   * Get the result of a specific step
   */
  getStepResult<T = any>(sessionId: string, stepName: WorkflowStepType): T | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;

    const step = session.steps.find(s => s.name === stepName);
    return step?.result as T;
  }

  /**
   * Get the Claude session ID for resumption
   */
  getClaudeSessionId(sessionId: string): string | undefined {
    const session = this.sessions.get(sessionId);
    return session?.claudeSessionId;
  }

  /**
   * Execute a full workflow
   */
  async executeWorkflow(
    bug: Bug,
    cliExecutor: ClaudeCodeCLIExecutor,
    steps: WorkflowStepType[],
    onProgress?: (step: WorkflowStepType, progress: number, message: string) => void
  ): Promise<WorkflowSession> {
    const session = this.createSession(bug, steps);
    this.startSession(session.id);

    const { buildFixPrompt, buildTestPrompt, buildScanPrompt, buildDocPrompt, securitySystemPrompt } =
      await import('./prompts/fix-prompt');

    let claudeSessionId: string | undefined;

    for (let i = 0; i < session.steps.length; i++) {
      const step = session.steps[i];
      this.startStep(session.id, i);

      onProgress?.(step.name, (i / steps.length) * 100, `Running ${step.name}...`);

      try {
        let result: any;
        let prompt: string;

        switch (step.name) {
          case 'scan':
            prompt = buildScanPrompt(bug);
            const scanResult = await cliExecutor.execute({
              prompt,
              outputFormat: 'json',
              appendSystemPrompt: securitySystemPrompt,
              allowedTools: ['Read', 'Glob', 'Grep'],
              maxTurns: 15,
              timeout: 300000,
              sessionId: claudeSessionId,
              resume: !!claudeSessionId,
            });
            result = scanResult.output;
            claudeSessionId = scanResult.sessionId || claudeSessionId;
            break;

          case 'fix':
            prompt = buildFixPrompt(bug);
            const fixResult = await cliExecutor.executeFix(prompt, securitySystemPrompt, {
              sessionId: claudeSessionId,
              resume: !!claudeSessionId,
            });
            result = fixResult.output;
            claudeSessionId = fixResult.sessionId || claudeSessionId;
            break;

          case 'test':
            const fixData = this.getStepResult<FixResult>(session.id, 'fix');
            prompt = buildTestPrompt(bug, fixData);
            const testResult = await cliExecutor.execute({
              prompt,
              outputFormat: 'json',
              appendSystemPrompt: securitySystemPrompt,
              allowedTools: ['Read', 'Edit', 'Glob'],
              maxTurns: 10,
              timeout: 180000,
              sessionId: claudeSessionId,
              resume: !!claudeSessionId,
            });
            result = testResult.output;
            claudeSessionId = testResult.sessionId || claudeSessionId;
            break;

          case 'document':
            const fixDataForDoc = this.getStepResult<FixResult>(session.id, 'fix');
            prompt = buildDocPrompt(bug, fixDataForDoc);
            const docResult = await cliExecutor.execute({
              prompt,
              outputFormat: 'json',
              appendSystemPrompt: securitySystemPrompt,
              allowedTools: ['Read'],
              maxTurns: 5,
              timeout: 120000,
              sessionId: claudeSessionId,
              resume: !!claudeSessionId,
            });
            result = docResult.output;
            claudeSessionId = docResult.sessionId || claudeSessionId;
            break;
        }

        this.completeStep(session.id, i, result, claudeSessionId);
        onProgress?.(step.name, ((i + 1) / steps.length) * 100, `${step.name} completed`);

      } catch (error: any) {
        this.failStep(session.id, i, error.message);
        onProgress?.(step.name, ((i + 1) / steps.length) * 100, `${step.name} failed: ${error.message}`);
        throw error;
      }
    }

    return this.getSession(session.id)!;
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this._onStateChange.dispose();
  }
}
