import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

export interface KioskPayload {
  storeId: string;
  mode: 'kiosk';
}

export function requireKiosk(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'キオスク認証が必要です' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, config.kioskJwtSecret) as KioskPayload;
    if (payload.mode !== 'kiosk') {
      res.status(401).json({ error: '無効なキオストークンです' });
      return;
    }
    (req as any).kioskStoreId = payload.storeId;
    next();
  } catch {
    res.status(401).json({ error: 'キオストークンが無効または期限切れです' });
  }
}
