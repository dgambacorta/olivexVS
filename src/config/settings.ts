import * as vscode from 'vscode';

export class ConfigManager {
  private static readonly CLIENT_ID_KEY = 'olivex.clientId';
  private static readonly CLIENT_SECRET_KEY = 'olivex.clientSecret';

  constructor(private context: vscode.ExtensionContext) {}

  /**
   * Get the API base URL from settings
   */
  getApiBaseUrl(): string {
    const config = vscode.workspace.getConfiguration('olivex');
    return config.get<string>('apiBaseUrl') || 'https://api.0xhunter.io';
  }

  /**
   * Get stored client ID
   */
  async getClientId(): Promise<string | undefined> {
    return await this.context.secrets.get(ConfigManager.CLIENT_ID_KEY);
  }

  /**
   * Get stored client secret
   */
  async getClientSecret(): Promise<string | undefined> {
    return await this.context.secrets.get(ConfigManager.CLIENT_SECRET_KEY);
  }

  /**
   * Store client credentials securely
   */
  async setCredentials(clientId: string, clientSecret: string): Promise<void> {
    await this.context.secrets.store(ConfigManager.CLIENT_ID_KEY, clientId);
    await this.context.secrets.store(ConfigManager.CLIENT_SECRET_KEY, clientSecret);
  }

  /**
   * Check if credentials are configured
   */
  async hasCredentials(): Promise<boolean> {
    const clientId = await this.getClientId();
    const clientSecret = await this.getClientSecret();
    return !!(clientId && clientSecret);
  }

  /**
   * Clear stored credentials
   */
  async clearCredentials(): Promise<void> {
    await this.context.secrets.delete(ConfigManager.CLIENT_ID_KEY);
    await this.context.secrets.delete(ConfigManager.CLIENT_SECRET_KEY);
  }

  /**
   * Get auto-refresh setting
   */
  getAutoRefresh(): boolean {
    const config = vscode.workspace.getConfiguration('olivex');
    return config.get<boolean>('autoRefresh') || false;
  }

  /**
   * Get refresh interval in seconds
   */
  getRefreshInterval(): number {
    const config = vscode.workspace.getConfiguration('olivex');
    return config.get<number>('refreshInterval') || 300;
  }
}
