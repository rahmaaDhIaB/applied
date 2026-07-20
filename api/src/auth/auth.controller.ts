import { Controller, Get, Query, Res, BadRequestException } from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { GoogleService } from './google.service';

@Controller('auth/google')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly google: GoogleService,
  ) {}

  /**
   * Step 1: the browser hits this, we bounce it to Google's consent screen.
   * A 302 redirect — nothing is rendered here.
   */
  @Get()
  login(@Res() res: Response) {
    res.redirect(this.google.getAuthUrl());
  }

  /**
   * Step 3: Google redirects the user back here with `?code=...`. This URL is
   * exactly the redirect URI registered in Google Cloud.
   */
  @Get('callback')
  async callback(@Query('code') code: string, @Res() res: Response) {
    if (!code) {
      // e.g. the user clicked "Cancel" on Google's consent screen.
      throw new BadRequestException('Missing authorization code');
    }

    const user = await this.authService.handleGoogleCallback(code);

    // For now, just prove it worked. Later this redirects to the frontend with
    // a session. Seeing your own email here means the whole dance succeeded.
    res.json({
      message: 'Gmail connected',
      user: { id: user.id, email: user.email },
    });
  }
}
