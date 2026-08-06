import { Router } from 'express';
import { Env } from '../config/env';
import { login, refresh, logout, changePassword, requestPasswordReset, confirmPasswordReset } from '../services/authService';
import { requireAuth } from '../middlewares/requireAuth';
import { InvalidCredentialsError, InvalidRefreshTokenError, InvalidResetTokenError } from '../helpers/errors';
import { User } from '../db/models/User';

const REFRESH_COOKIE_NAME = 'refreshToken';

function refreshCookieOptions(env: Env) {
  return {
    httpOnly: true,
    secure: env.nodeEnv === 'production',
    sameSite: 'strict' as const,
    path: '/api/auth',
    maxAge: env.refreshTokenExpiresInDays * 24 * 60 * 60 * 1000,
  };
}

function clearCookieOptions(env: Env) {
  return {
    httpOnly: true,
    secure: env.nodeEnv === 'production',
    sameSite: 'strict' as const,
    path: '/api/auth',
  };
}

export function createAuthRouter(env: Env): Router {
  const router = Router();

  router.post('/login', async (req, res) => {
    try {
      const { username, password } = req.body;
      const result = await login({ username, password, env });
      res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, refreshCookieOptions(env));
      res.status(200).json({ success: true, data: { accessToken: result.accessToken } });
    } catch (err) {
      if (err instanceof InvalidCredentialsError) {
        res.status(401).json({ success: false, message: 'Invalid username or password' });
        return;
      }
      res.status(500).json({ success: false, message: 'Contact the system administrator.' });
    }
  });

  router.post('/refresh', async (req, res) => {
    try {
      const rawRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
      if (!rawRefreshToken) {
        res.status(401).json({ success: false, message: 'Missing refresh token' });
        return;
      }
      const result = await refresh({ rawRefreshToken, env });
      res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, refreshCookieOptions(env));
      res.status(200).json({ success: true, data: { accessToken: result.accessToken } });
    } catch (err) {
      if (err instanceof InvalidRefreshTokenError) {
        res.clearCookie(REFRESH_COOKIE_NAME, clearCookieOptions(env));
        res.status(401).json({ success: false, message: 'Invalid refresh token' });
        return;
      }
      res.status(500).json({ success: false, message: 'Contact the system administrator.' });
    }
  });

  router.post('/logout', async (req, res) => {
    try {
      const rawRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
      if (rawRefreshToken) {
        await logout({ rawRefreshToken });
      }
      res.clearCookie(REFRESH_COOKIE_NAME, clearCookieOptions(env));
      res.status(200).json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Contact the system administrator.' });
    }
  });

  router.get('/me', requireAuth(env), async (req, res) => {
    const user = await User.findById(req.authUser!.id).select('-passwordHash');
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }
    res.status(200).json({ success: true, data: user });
  });

  router.put('/change-password', requireAuth(env), async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      await changePassword({ userId: req.authUser!.id, currentPassword, newPassword, env });
      res.status(200).json({ success: true });
    } catch (err) {
      if (err instanceof InvalidCredentialsError) {
        res.status(401).json({ success: false, message: 'Current password is incorrect' });
        return;
      }
      res.status(500).json({ success: false, message: 'Contact the system administrator.' });
    }
  });

  router.post('/reset-password/request', async (req, res) => {
    await requestPasswordReset({ usernameOrEmail: req.body.usernameOrEmail, env });
    res.status(200).json({ success: true });
  });

  router.post('/reset-password/confirm', async (req, res) => {
    try {
      await confirmPasswordReset({ rawToken: req.body.token, newPassword: req.body.newPassword, env });
      res.status(200).json({ success: true });
    } catch (err) {
      if (err instanceof InvalidResetTokenError) {
        res.status(400).json({ success: false, message: 'Invalid or expired reset token' });
        return;
      }
      res.status(500).json({ success: false, message: 'Contact the system administrator.' });
    }
  });

  return router;
}
