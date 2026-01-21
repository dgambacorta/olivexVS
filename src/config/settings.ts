import * as vscode from 'vscode';

export class ConfigManager {
  private static readonly CLIENT_ID_KEY = 'olivex.clientId';
  private static readonly CLIENT_SECRET_KEY = 'olivex.clientSecret';
  private static readonly ACCESS_TOKEN_KEY = 'olivex.accessToken';
  private static readonly REFRESH_TOKEN_KEY = 'olivex.refreshToken';
  private static readonly TOKEN_EXPIRY_KEY = 'olivex.tokenExpiry';

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

  /**
   * Get the API base URL (alias for getApiBaseUrl)
   */
  getBaseUrl(): string {
    return this.getApiBaseUrl();
  }

  /**
   * Store access token
   */
  async setAccessToken(token: string, expiresIn?: number): Promise<void> {
    await this.context.secrets.store(ConfigManager.ACCESS_TOKEN_KEY, token);
    if (expiresIn) {
      const expiry = Date.now() + (expiresIn * 1000);
      await this.context.secrets.store(ConfigManager.TOKEN_EXPIRY_KEY, expiry.toString());
    }
  }

  /**
   * Get stored access token
   */
  async getAccessToken(): Promise<string | undefined> {
    // Check if token is expired
    const expiry = await this.context.secrets.get(ConfigManager.TOKEN_EXPIRY_KEY);
    if (expiry) {
      const expiryTime = parseInt(expiry, 10);
      if (Date.now() >= expiryTime) {
        // Token expired, try to refresh
        const refreshed = await this.refreshToken();
        if (!refreshed) {
          return undefined;
        }
      }
    }
    return await this.context.secrets.get(ConfigManager.ACCESS_TOKEN_KEY);
  }

  /**
   * Store refresh token
   */
  async setRefreshToken(token: string): Promise<void> {
    await this.context.secrets.store(ConfigManager.REFRESH_TOKEN_KEY, token);
  }

  /**
   * Get stored refresh token
   */
  async getRefreshToken(): Promise<string | undefined> {
    return await this.context.secrets.get(ConfigManager.REFRESH_TOKEN_KEY);
  }

  /**
   * Refresh the access token using the refresh token
   */
  async refreshToken(): Promise<boolean> {
    try {
      const refreshToken = await this.getRefreshToken();
      const clientId = await this.getClientId();
      const clientSecret = await this.getClientSecret();

      if (!refreshToken || !clientId || !clientSecret) {
        return false;
      }

      const baseUrl = this.getBaseUrl();
      const response = await fetch(`${baseUrl}/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: clientId,
          client_secret: clientSecret,
        }),
      });

      if (!response.ok) {
        return false;
      }

      const data = await response.json() as {
        access_token: string;
        expires_in?: number;
        refresh_token?: string;
      };
      await this.setAccessToken(data.access_token, data.expires_in);
      if (data.refresh_token) {
        await this.setRefreshToken(data.refresh_token);
      }

      return true;
    } catch (error) {
      console.error('Failed to refresh token:', error);
      return false;
    }
  }

  /**
   * Authenticate with client credentials and store tokens
   */
  async authenticate(): Promise<boolean> {
    try {
      const clientId = await this.getClientId();
      const clientSecret = await this.getClientSecret();

      if (!clientId || !clientSecret) {
        return false;
      }

      const baseUrl = this.getBaseUrl();
      const response = await fetch(`${baseUrl}/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
        }),
      });

      if (!response.ok) {
        return false;
      }

      const data = await response.json() as {
        access_token: string;
        expires_in?: number;
        refresh_token?: string;
      };
      await this.setAccessToken(data.access_token, data.expires_in);
      if (data.refresh_token) {
        await this.setRefreshToken(data.refresh_token);
      }

      return true;
    } catch (error) {
      console.error('Authentication failed:', error);
      return false;
    }
  }

  /**
   * Clear all stored tokens
   */
  async clearTokens(): Promise<void> {
    await this.context.secrets.delete(ConfigManager.ACCESS_TOKEN_KEY);
    await this.context.secrets.delete(ConfigManager.REFRESH_TOKEN_KEY);
    await this.context.secrets.delete(ConfigManager.TOKEN_EXPIRY_KEY);
  }
}
