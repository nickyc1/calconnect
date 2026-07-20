import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { supabaseAdmin } from './supabase';

const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
];

class GoogleAuthService {
  private clientId: string;
  private clientSecret: string;

  constructor() {
    this.clientId = process.env.GOOGLE_CLIENT_ID!;
    this.clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
  }

  /**
   * Create a base OAuth2 client (no tokens set)
   */
  createBaseClient(redirectUri?: string): OAuth2Client {
    return new google.auth.OAuth2(
      this.clientId,
      this.clientSecret,
      redirectUri || `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google/callback`
    );
  }

  /**
   * Generate the Google OAuth consent URL for connecting a new calendar account
   */
  getAuthUrl(state: string): string {
    const client = this.createBaseClient();
    return client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: SCOPES,
      state,
    });
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCode(code: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiryDate: number;
    email: string;
  }> {
    const client = this.createBaseClient();
    const { tokens } = await client.getToken(code);

    if (!tokens.refresh_token) {
      throw new Error('No refresh token received. User may need to revoke access and reconnect.');
    }

    // Get the user's email from the token
    client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const { data: userInfo } = await oauth2.userinfo.get();

    return {
      accessToken: tokens.access_token!,
      refreshToken: tokens.refresh_token,
      expiryDate: tokens.expiry_date || Date.now() + 3600 * 1000,
      email: userInfo.email!,
    };
  }

  /**
   * Get an authenticated OAuth2 client for a specific account
   * Automatically refreshes the access token if expired
   */
  async getClientForAccount(accountId: string): Promise<OAuth2Client> {
    const { data: account, error } = await supabaseAdmin
      .from('user_accounts')
      .select('refresh_token, access_token, token_expiry, account_id')
      .eq('id', accountId)
      .single();

    if (error || !account) {
      throw new Error(`Account not found: ${accountId}`);
    }

    const client = this.createBaseClient();
    client.setCredentials({
      refresh_token: (account as any).refresh_token,
      access_token: (account as any).access_token,
      expiry_date: (account as any).token_expiry
        ? new Date((account as any).token_expiry).getTime()
        : undefined,
    });

    // Check if token needs refresh (expired or expiring in next 5 min)
    const expiry = (account as any).token_expiry
      ? new Date((account as any).token_expiry).getTime()
      : 0;

    if (Date.now() > expiry - 5 * 60 * 1000) {
      try {
        const { credentials } = await client.refreshAccessToken();
        client.setCredentials(credentials);

        // Store refreshed tokens
        await (supabaseAdmin as any)
          .from('user_accounts')
          .update({
            access_token: credentials.access_token,
            token_expiry: credentials.expiry_date
              ? new Date(credentials.expiry_date).toISOString()
              : null,
          })
          .eq('id', accountId);
      } catch (err: any) {
        // Google returns invalid_grant when the refresh token has been revoked,
        // expired (testing-mode 7-day cap), or otherwise invalidated. Mark the
        // account so the dashboard can prompt reconnect, then rethrow so the
        // caller can bail. Any other refresh error we rethrow unchanged.
        const errStr = String(err?.response?.data?.error || err?.message || err);
        if (errStr.includes('invalid_grant') || errStr.includes('Token has been expired') || errStr.includes('unauthorized_client')) {
          await (supabaseAdmin as any)
            .from('user_accounts')
            .update({
              needs_reauth: true,
              reauth_flagged_at: new Date().toISOString(),
            })
            .eq('id', accountId);
        }
        throw err;
      }
    }

    return client;
  }

  /**
   * Get an authenticated OAuth2 client by the account's account_id field
   * (the unique identifier we use, not the row UUID)
   */
  async getClientByAccountId(userId: string, accountId: string): Promise<OAuth2Client> {
    const { data: account, error } = await supabaseAdmin
      .from('user_accounts')
      .select('id, refresh_token, access_token, token_expiry')
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .single();

    if (error || !account) {
      throw new Error(`Account not found for user ${userId}, account ${accountId}`);
    }

    return this.getClientForAccount((account as any).id);
  }
}

export const googleAuth = new GoogleAuthService();
