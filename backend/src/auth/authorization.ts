import { Response } from 'express';
import type { Request } from 'express';
import type { StaffRole } from '../types';
import { supabaseAdmin } from '../config/supabase';

export const VALID_STAFF_ROLES: StaffRole[] = ['owner', 'manager', 'leader', 'full_time', 'part_time'];
const MANAGED_ROLES: StaffRole[] = ['owner', 'manager', 'leader'];

interface StoreMembership {
  id: string;
  role: StaffRole;
}

export function isManagedRole(role: string): role is StaffRole {
  return MANAGED_ROLES.includes(role as StaffRole);
}

async function getStoreMembership(_accessToken: string, storeId: string, userId: string): Promise<StoreMembership | null> {
  // supabaseAdmin を使用（requireAuth で認証済み、RLS不要で高速）
  const { data, error } = await supabaseAdmin
    .from('store_staff')
    .select('id, role')
    .eq('store_id', storeId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[authz] store membership lookup failed', {
      storeId,
      userId,
      code: error.code,
      message: error.message,
      details: error.details,
    });
    return null;
  }

  if (!data) {
    return null;
  }

  return data as StoreMembership;
}

export async function requireStoreMembership(req: Request, res: Response, storeId: string): Promise<StoreMembership | null> {
  const membership = await getStoreMembership(req.accessToken!, storeId, req.user!.id);

  if (!membership) {
    res.status(403).json({ error: 'この店舗へのアクセス権限がありません' });
    return null;
  }

  return membership;
}

export async function requireManagedStore(req: Request, res: Response, storeId: string): Promise<StoreMembership | null> {
  const membership = await requireStoreMembership(req, res, storeId);
  if (!membership) {
    return null;
  }

  if (!isManagedRole(membership.role)) {
    res.status(403).json({ error: '管理者権限が必要です' });
    return null;
  }

  return membership;
}

export async function staffBelongsToStore(storeId: string, staffId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('store_staff')
    .select('id')
    .eq('id', staffId)
    .eq('store_id', storeId)
    .maybeSingle();

  return !error && !!data;
}

export async function isShiftRequestEnabled(storeId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('store_plugins')
    .select('config')
    .eq('store_id', storeId)
    .eq('plugin_name', 'shift')
    .maybeSingle();

  if (error || !data) {
    return true;
  }

  return data.config?.allow_staff_request ?? true;
}
