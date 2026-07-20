import { Injectable } from '@nestjs/common';
import { google } from 'googleapis';

/**
 * Everything that talks to Google's OAuth endpoints lives here.
 *
 * We only ask for `gmail.readonly` — the app reads mail and nothing else.
 * Least privilege: if the token ever leaked, it still can't send or delete.
 */
@Injectable()
export class GoogleService {
  private readonly scopes = ['https://www.googleapis.com/auth/gmail.readonly'];

  /**
   * A fresh OAuth2 client configured with our app's credentials. It's the
   * object googleapis uses to build URLs and exchange codes for tokens.
   */
  // Return type inferred — annotating it drags in a mismatched copy of the
  // google-auth-library types that ships nested inside googleapis.
  private createClient() {
    return new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );
  }

  /**
   * Step 1 of the dance: the URL we send the user to on Google's side.
   */
  getAuthUrl(): string {
    return this.createClient().generateAuthUrl({
      // 'offline' is what makes Google return a refresh_token, not just an
      // access_token. Without it we could read mail once, then be locked out
      // in an hour when the access token expires.
      access_type: 'offline',
      scope: this.scopes,
      // Force the consent screen every time so we reliably get a refresh_token.
      // Google only sends one on first consent otherwise, which bites in dev
      // when you connect the same account repeatedly.
      prompt: 'consent',
    });
  }

  /**
   * Step 4: swap the one-time `code` Google redirected back with for real
   * tokens. This call is server-to-server and includes our client secret,
   * which is why it can never happen in the browser.
   */
  async getTokens(code: string): Promise<{
    access_token?: string | null;
    refresh_token?: string | null;
    expiry_date?: number | null;
  }> {
    const client = this.createClient();
    const { tokens } = await client.getToken(code);
    return tokens; // { access_token, refresh_token, expiry_date, ... }
  }

  /**
   * Given tokens, ask Google who this actually is. We need the account's
   * Google id and email to create or find the matching User row.
   */
  async getProfile(accessToken: string, refreshToken?: string | null) {
    const client = this.createClient();
    client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken ?? undefined,
    });

    // The Gmail "profile" endpoint returns the address of the mailbox we were
    // granted access to — exactly the account we want to track.
    const gmail = google.gmail({ version: 'v1', auth: client });
    const { data } = await gmail.users.getProfile({ userId: 'me' });

    return { email: data.emailAddress ?? '' };
  }
}
