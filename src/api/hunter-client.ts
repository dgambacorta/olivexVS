import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';
import {
  HunterConfig,
  AuthResponse,
  Bug,
  BugsResponse,
  UpdateBugStatusRequest,
  BugStatus
} from '../types';

interface RequestOptions {
  body?: any;
  params?: Record<string, string | number>;
  includeAuth?: boolean;
  headers?: Record<string, string>;
}

export class HunterClient {
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;
  private readonly timeoutMs = 30000;

  constructor(private config: HunterConfig) {
  }

  /**
   * Authenticate with 0xHunter API using OAuth2 client credentials flow
   */
  async authenticate(): Promise<string> {
    try {
      console.log('[HunterClient] Sending auth request to:', this.config.baseUrl + '/api/token');
      console.log('[HunterClient] Request body:', {
        client_id: this.config.clientId,
        grant_type: 'client_credentials',
        client_secret: '***REDACTED***'
      });
      
      const response = await this.request<AuthResponse>('POST', '/api/token', {
        includeAuth: false,
        body: {
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          grant_type: 'client_credentials',
        },
      });

      console.log('[HunterClient] Auth response received, expires_in:', response.expires_in);
      
      this.accessToken = response.access_token;
      this.tokenExpiry = Date.now() + response.expires_in * 1000;

      // Token will be included automatically on future requests

      return this.accessToken;
    } catch (error) {
      console.error('[HunterClient] Auth request failed:', error);
      throw this.wrapError('Authentication failed', error);
    }
  }

  /**
   * Ensure we have a valid access token
   */
  private async ensureAuthenticated(): Promise<void> {
    if (!this.accessToken || Date.now() >= this.tokenExpiry) {
      await this.authenticate();
    }
  }

  /**
   * Get all bugs for the authenticated client
   */
  async getBugs(programId?: string, page: number = 1, pageSize: number = 100): Promise<BugsResponse> {
    await this.ensureAuthenticated();
    
    console.log('[HunterClient] getBugs - Token:', this.accessToken ? 'Present' : 'Missing');
    console.log('[HunterClient] getBugs - Making request to /api/reports');

    try {
      const response = await this.request<any>('GET', '/api/reports', {
        params: {
          page,
          page_size: pageSize,
          ...(programId ? { program_id: programId } : {}),
        },
      });
      
      console.log('[HunterClient] getBugs - Raw response:', JSON.stringify(response, null, 2));
      console.log('[HunterClient] getBugs - Response is array:', Array.isArray(response));
      
      // Si la API devuelve un array directo, envolverlo en un objeto
      if (Array.isArray(response)) {
        const bugsResponse: BugsResponse = {
          reports: response,
          total: response.length,
          page: page,
          pageSize: pageSize
        };
        console.log('[HunterClient] getBugs - Normalized response:', bugsResponse);
        return bugsResponse;
      }
      
      return response;
    } catch (error) {
      console.error('[HunterClient] getBugs - Error:', error);
      throw this.wrapError('Failed to fetch bugs', error);
    }
  }

  /**
   * Get detailed information about a specific bug
   */
  async getBugDetail(bugId: string): Promise<Bug> {
    await this.ensureAuthenticated();

    try {
      const response = await this.request<Bug>('GET', `/api/reports/${bugId}`);
      return response;
    } catch (error) {
      throw this.wrapError('Failed to fetch bug details', error);
    }
  }

  /**
   * Update the status of a bug
   */
  async updateBugStatus(bugId: string, status: BugStatus, comment?: string): Promise<Bug> {
    await this.ensureAuthenticated();

    try {
      const payload: UpdateBugStatusRequest = { status };
      if (comment) {
        payload.comment = comment;
      }

      const response = await this.request<Bug>('PATCH', `/api/reports/${bugId}/status`, {
        body: payload,
      });
      return response;
    } catch (error) {
      throw this.wrapError('Failed to update bug status', error);
    }
  }

  /**
   * Test the connection to 0xHunter API
   */
  async testConnection(): Promise<boolean> {
    try {
      console.log('[HunterClient] Testing connection to:', this.config.baseUrl);
      console.log('[HunterClient] Client ID:', this.config.clientId);
      console.log('[HunterClient] Attempting authentication...');
      
      await this.authenticate();
      
      console.log('[HunterClient] ✅ Authentication successful!');
      return true;
    } catch (error) {
      console.error('[HunterClient] ❌ Authentication failed:', error);
      if (error instanceof Error) {
        console.error('[HunterClient] Error message:', error.message);
        console.error('[HunterClient] Error stack:', error.stack);
      }
      return false;
    }
  }

  /**
   * Get programs accessible to this client
   */
  async getPrograms(): Promise<any[]> {
    await this.ensureAuthenticated();

    try {
      const response = await this.request<{ programs?: any[] }>('GET', '/api/programs');
      return response.programs || [];
    } catch (error) {
      throw this.wrapError('Failed to fetch programs', error);
    }
  }

  private async request<T>(
    method: string,
    path: string,
    options: RequestOptions = {}
  ): Promise<T> {
    const url = new URL(path, this.config.baseUrl);
    if (options.params) {
      for (const [key, value] of Object.entries(options.params)) {
        if (value === undefined || value === null) {
          continue;
        }
        url.searchParams.append(key, String(value));
      }
    }

    const body = options.body !== undefined ? JSON.stringify(options.body) : undefined;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (options.includeAuth !== false && this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
      console.log('[HunterClient] request - Adding Authorization header');
    } else {
      console.log('[HunterClient] request - No Authorization header (includeAuth:', options.includeAuth, 'token:', this.accessToken ? 'present' : 'missing', ')');
    }
    
    console.log('[HunterClient] request - Making', method, 'request to:', url.toString());
    console.log('[HunterClient] request - Headers:', JSON.stringify(headers, null, 2));

    const transport = url.protocol === 'https:' ? https : http;

    return new Promise<T>((resolve, reject) => {
      const req = transport.request(
        url,
        {
          method,
          headers,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk) => {
            chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
          });

          res.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8');
            const status = res.statusCode ?? 0;
            
            console.log('[HunterClient] request - Response status:', status);
            console.log('[HunterClient] request - Response body:', raw);

            if (status >= 200 && status < 300) {
              if (!raw) {
                resolve({} as T);
                return;
              }
              try {
                resolve(JSON.parse(raw) as T);
              } catch (parseError) {
                reject(parseError);
              }
              return;
            }

            reject(this.buildHttpError(status, raw));
          });
        }
      );

      req.on('error', (error) => reject(error));
      req.setTimeout(this.timeoutMs, () => {
        req.destroy(new Error('Request timed out'));
      });

      if (body) {
        req.write(body);
      }

      req.end();
    });
  }

  private buildHttpError(statusCode: number, rawBody: string): Error {
    let serverMessage: string | undefined;
    if (rawBody) {
      try {
        const parsed = JSON.parse(rawBody);
        serverMessage =
          typeof parsed === 'string'
            ? parsed
            : parsed?.message || parsed?.error_description || parsed?.error;
      } catch {
        serverMessage = rawBody;
      }
    }

    const message = serverMessage
      ? `${serverMessage} (status ${statusCode})`
      : `Request failed with status ${statusCode}`;
    return new Error(message);
  }

  private wrapError(prefix: string, error: unknown): Error {
    if (error instanceof Error) {
      return new Error(`${prefix}: ${error.message}`);
    }

    return new Error(`${prefix}: Unknown error`);
  }
}
