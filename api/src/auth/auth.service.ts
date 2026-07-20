import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleService } from './google.service';

/**
 * The business logic of "a user connected their Gmail". Kept separate from the
 * controller so the controller only deals with HTTP, and this only deals with
 * what should happen.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly google: GoogleService,
  ) {}

  /**
   * Runs after Google redirects back with a code. Turns that code into a stored
   * User with fresh tokens, and returns the user.
   */
  async handleGoogleCallback(code: string) {
    // 1. code -> tokens
    const tokens = await this.google.getTokens(code);

    // 2. tokens -> which Google account is this
    const profile = await this.google.getProfile(
      tokens.access_token ?? '',
      tokens.refresh_token,
    );

    // 3. upsert: create the user the first time, update tokens every time after.
    //    We key on email — one row per connected mailbox. Re-connecting the same
    //    account refreshes the tokens instead of creating a duplicate.
    const user = await this.prisma.user.upsert({
      where: { email: profile.email },
      create: {
        email: profile.email,
        // We don't get a stable Google user id from the readonly Gmail scope,
        // so we use the email as the external identifier too. Good enough while
        // one person connects one inbox; revisit if we ever add more scopes.
        googleId: profile.email,
        accessToken: tokens.access_token ?? null,
        refreshToken: tokens.refresh_token ?? null,
      },
      update: {
        accessToken: tokens.access_token ?? null,
        // Google only returns a refresh_token on first consent. Never overwrite
        // a good stored one with null on later logins.
        ...(tokens.refresh_token
          ? { refreshToken: tokens.refresh_token }
          : {}),
      },
    });

    return user;
  }
}
