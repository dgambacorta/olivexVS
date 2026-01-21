import * as vscode from 'vscode';
import { ConfigManager } from '../config/settings';
import { FixResult } from '../claude/cli-executor';
import { ScanResults, ScanFinding } from '../providers/scanResultsPanel';
import { getNotificationService, ErrorType, OliveXError } from './notificationService';

/**
 * Fix sync payload structure
 */
export interface FixSyncPayload {
  report_id: string;
  fix_applied: boolean;
  fix_details: {
    file_path: string;
    original_code?: string;
    fixed_code: string;
    explanation: string;
    security_measures: string[];
  };
  vulnerability_analysis?: {
    root_cause: string;
    attack_vector: string;
    impact_assessment?: string;
  };
  verification_steps?: string[];
  fixed_at: string;
  fixed_by: 'claude_code' | 'manual';
}

/**
 * Scan results sync payload
 */
export interface ScanSyncPayload {
  report_id: string;
  scan_type: 'similar' | 'batch' | 'full_audit';
  findings: {
    vulnerability_type: string;
    file_path: string;
    line_numbers: number[];
    risk_level: string;
    confidence: string;
    recommendation: string;
    cwe_id?: string;
  }[];
  scan_summary: {
    files_scanned: number;
    total_findings: number;
    patterns_checked: string[];
  };
  scanned_at: string;
}

/**
 * Test cases sync payload
 */
export interface TestSyncPayload {
  report_id: string;
  test_cases: {
    name: string;
    description: string;
    code: string;
    expected_result: string;
    covers_attack_vector: boolean;
  }[];
  generated_at: string;
}

/**
 * Documentation sync payload
 */
export interface DocSyncPayload {
  report_id: string;
  documentation: {
    summary: string;
    technical_details: string;
    fix_explanation: string;
    prevention_guidelines: string[];
  };
  generated_at: string;
}

/**
 * API Sync Service for syncing results with 0xHunter backend
 */
export class APISyncService {
  private configManager: ConfigManager;
  private notificationService = getNotificationService();
  private syncQueue: Array<{ type: string; payload: any; retries: number }> = [];
  private isSyncing = false;

  constructor(configManager: ConfigManager) {
    this.configManager = configManager;
  }

  /**
   * Sync a fix result with the backend
   */
  async syncFix(reportId: string, fixResult: FixResult): Promise<boolean> {
    const payload: FixSyncPayload = {
      report_id: reportId,
      fix_applied: fixResult.success,
      fix_details: {
        file_path: fixResult.fix?.file_path || '',
        original_code: fixResult.fix?.original_code,
        fixed_code: fixResult.fix?.fixed_code || '',
        explanation: fixResult.fix?.explanation || '',
        security_measures: fixResult.fix?.security_measures_added || [],
      },
      vulnerability_analysis: fixResult.vulnerability_analysis,
      verification_steps: fixResult.verification_steps,
      fixed_at: new Date().toISOString(),
      fixed_by: 'claude_code',
    };

    return this.syncToBackend('fix', `/api/reports/${reportId}/ai-fix`, payload);
  }

  /**
   * Sync scan results with the backend
   */
  async syncScanResults(
    reportId: string,
    results: ScanResults,
    scanType: 'similar' | 'batch' | 'full_audit' = 'similar'
  ): Promise<boolean> {
    const payload: ScanSyncPayload = {
      report_id: reportId,
      scan_type: scanType,
      findings: results.similar_vulnerabilities.map(f => ({
        vulnerability_type: f.vulnerability_type,
        file_path: f.file_path,
        line_numbers: f.line_numbers,
        risk_level: f.risk_level,
        confidence: f.confidence,
        recommendation: f.recommendation,
        cwe_id: f.cwe_id,
      })),
      scan_summary: results.scan_summary,
      scanned_at: new Date().toISOString(),
    };

    return this.syncToBackend('scan', `/api/reports/${reportId}/similar-findings`, payload);
  }

  /**
   * Sync test cases with the backend
   */
  async syncTestCases(reportId: string, testCases: any[]): Promise<boolean> {
    const payload: TestSyncPayload = {
      report_id: reportId,
      test_cases: testCases.map(tc => ({
        name: tc.name || 'Security Test',
        description: tc.description || '',
        code: tc.code || '',
        expected_result: tc.expected_result || '',
        covers_attack_vector: tc.covers_attack_vector || false,
      })),
      generated_at: new Date().toISOString(),
    };

    return this.syncToBackend('tests', `/api/reports/${reportId}/ai-tests`, payload);
  }

  /**
   * Sync documentation with the backend
   */
  async syncDocumentation(reportId: string, documentation: any): Promise<boolean> {
    const payload: DocSyncPayload = {
      report_id: reportId,
      documentation: {
        summary: documentation.vulnerability_summary?.title || '',
        technical_details: documentation.technical_details?.root_cause || '',
        fix_explanation: documentation.fix_details?.approach || '',
        prevention_guidelines: documentation.prevention?.recommendations || [],
      },
      generated_at: new Date().toISOString(),
    };

    return this.syncToBackend('docs', `/api/reports/${reportId}/ai-docs`, payload);
  }

  /**
   * Generic sync to backend
   */
  private async syncToBackend(type: string, endpoint: string, payload: any): Promise<boolean> {
    // Check if sync is enabled
    const syncEnabled = vscode.workspace.getConfiguration('olivex').get<boolean>('syncWithBackend', true);
    if (!syncEnabled) {
      this.notificationService.log(`Sync disabled - skipping ${type} sync`);
      return true;
    }

    // Check credentials
    const hasCredentials = await this.configManager.hasCredentials();
    if (!hasCredentials) {
      this.notificationService.log(`No credentials - skipping ${type} sync`);
      return false;
    }

    try {
      const baseUrl = this.configManager.getBaseUrl();
      const accessToken = await this.configManager.getAccessToken();

      if (!accessToken) {
        throw new Error('No access token available');
      }

      const response = await fetch(`${baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        if (response.status === 401) {
          // Try to refresh token
          const refreshed = await this.configManager.refreshToken();
          if (refreshed) {
            return this.syncToBackend(type, endpoint, payload);
          }
          throw new Error('Authentication failed');
        }

        const errorText = await response.text();
        throw new Error(`API error ${response.status}: ${errorText}`);
      }

      this.notificationService.log(`Successfully synced ${type} to backend`);
      return true;

    } catch (error: any) {
      // Add to retry queue
      this.addToSyncQueue(type, payload);

      // Log but don't show notification for sync failures (background operation)
      this.notificationService.log(`Failed to sync ${type}: ${error.message}`);

      return false;
    }
  }

  /**
   * Add failed sync to queue for retry
   */
  private addToSyncQueue(type: string, payload: any): void {
    // Only queue if not already there
    const exists = this.syncQueue.some(
      item => item.type === type && item.payload.report_id === payload.report_id
    );

    if (!exists) {
      this.syncQueue.push({ type, payload, retries: 0 });
    }
  }

  /**
   * Process sync queue (can be called periodically)
   */
  async processSyncQueue(): Promise<void> {
    if (this.isSyncing || this.syncQueue.length === 0) {
      return;
    }

    this.isSyncing = true;
    const maxRetries = 3;

    try {
      const itemsToProcess = [...this.syncQueue];
      this.syncQueue = [];

      for (const item of itemsToProcess) {
        if (item.retries >= maxRetries) {
          this.notificationService.log(`Giving up on syncing ${item.type} after ${maxRetries} retries`);
          continue;
        }

        const endpoint = this.getEndpointForType(item.type, item.payload.report_id);
        const success = await this.syncToBackend(item.type, endpoint, item.payload);

        if (!success) {
          item.retries++;
          this.syncQueue.push(item);
        }
      }
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Get endpoint for sync type
   */
  private getEndpointForType(type: string, reportId: string): string {
    const endpoints: Record<string, string> = {
      fix: `/api/reports/${reportId}/ai-fix`,
      scan: `/api/reports/${reportId}/similar-findings`,
      tests: `/api/reports/${reportId}/ai-tests`,
      docs: `/api/reports/${reportId}/ai-docs`,
    };
    return endpoints[type] || `/api/reports/${reportId}/${type}`;
  }

  /**
   * Get pending sync count
   */
  getPendingSyncCount(): number {
    return this.syncQueue.length;
  }

  /**
   * Clear sync queue
   */
  clearSyncQueue(): void {
    this.syncQueue = [];
  }

  /**
   * Update report status
   */
  async updateReportStatus(reportId: string, status: string, comment?: string): Promise<boolean> {
    try {
      const baseUrl = this.configManager.getBaseUrl();
      const accessToken = await this.configManager.getAccessToken();

      if (!accessToken) {
        throw new Error('No access token available');
      }

      const response = await fetch(`${baseUrl}/api/reports/${reportId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ status, comment }),
      });

      if (!response.ok) {
        throw new Error(`Failed to update status: ${response.status}`);
      }

      return true;
    } catch (error: any) {
      await this.notificationService.handleError({
        type: ErrorType.NETWORK,
        message: 'Failed to update report status',
        details: error.message,
        recoverable: true,
      });
      return false;
    }
  }
}

// Singleton instance
let apiSyncServiceInstance: APISyncService | null = null;

export function getAPISyncService(configManager: ConfigManager): APISyncService {
  if (!apiSyncServiceInstance) {
    apiSyncServiceInstance = new APISyncService(configManager);
  }
  return apiSyncServiceInstance;
}
