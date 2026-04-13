import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase';

// Supabase Auth JWTを検証してreq.userにセット
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'ログインが必要です' });
    return;
  }

  const token = authHeader.slice(7);
  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data.user) {
    res.status(401).json({ error: '認証が無効です' });
    return;
  }

  req.user = data.user;
  req.accessToken = token;
  next();
}
