import { Router } from 'express';
import { Env } from '../config/env';
import { login, refresh, logout } from '../services/authService';
import { requireAuth } from '../middlewares/requireAuth';
import { InvalidCredentialsError, InvalidRefreshTokenError } from '../helpers/errors';
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
        res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/auth' });
        res.status(401).json({ success: false, message: 'Invalid refresh token' });
        return;
      }
      res.status(500).json({ success: false, message: 'Contact the system administrator.' });
    }
  });

  router.post('/logout', async (req, res) => {
    const rawRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
    if (rawRefreshToken) {
      await logout({ rawRefreshToken });
    }
    res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/auth' });
    res.status(200).json({ success: true });
  });

  router.get('/me', requireAuth(env), async (req, res) => {
    const user = await User.findById(req.authUser!.id).select('-passwordHash');
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }
    res.status(200).json({ success: true, data: user });
  });

  return router;
}
