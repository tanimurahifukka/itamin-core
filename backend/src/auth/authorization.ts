import { Response } from 'express';
import type { Request } from 'express';
import type { StaffRole } from '../types';
import { supabaseAdmin } from '../config/supabase';

export const VALID_STAFF_ROLES: StaffRole[] = ['owner', 'manager', 'leader', 'full_time', 'part_time'];
const MANAGED_ROLES: StaffRole[] = ['owner', 'manager', 'leader'];

export type OrgRole = 'owner' | 'admin' | 'viewer';
export type PlatformRole = 'super_admin' | 'admin' | 'support' | 'viewer';
export type MembershipSource = 'store_staff' | 'organization' | 'platform';

interface StoreMembership {
  id: string;
  role: StaffRole;
  source: MembershipSource;
}

export function isManagedRole(role: string): role is StaffRole {
  return MANAGED_ROLES.includes(role as StaffRole);
}

// org_role → staff_role マッピング
function mapOrgRoleToStaffRole(orgRole: OrgRole): StaffRole {
  switch (orgRole) {
    case 'owner':
    case 'admin':
      return 'manager';
    case 'viewer':
    default:
      return 'full_time';
  }
}

// platform_role → staff_role マッピング
function mapPlatformRoleToStaffRole(platformRole: PlatformRole): StaffRole {
  switch (platformRole) {
    case 'super_admin':
    case 'admin':
      return 'owner';
    case 'support':
      return 'manager';
    case 'viewer':
    default:
      return 'full_time';
  }
}

async function getStoreStaffMembership(storeId: string, userId: string): Promise<StoreMembership | null> {
  const { data, error } = await supabaseAdmin
    .from('store_staff')
    .select('id, role')
    .eq('store_id', storeId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[authz] store_staff lookup failed', {
      storeId, userId, code: error.code, message: error.message,
    });
    return null;
  }
  if (!data) return null;
  return { id: (data as any).id, role: (data as any).role, source: 'store_staff' };
}

async function getOrgMembershipForStore(storeId: string, userId: string): Promise<StoreMembership | null> {
  // 店舗の org_id を取得
  const { data: store, error: storeErr } = await supabaseAdmin
    .from('stores')
    .select('id, org_id')
    .eq('id', storeId)
    .maybeSingle();

  if (storeErr || !store || !(store as any).org_id) return null;

  const { data: member, error: memberErr } = await supabaseAdmin
    .from('organization_members')
    .select('id, role')
    .eq('org_id', (store as any).org_id)
    .eq('user_id', userId)
    .maybeSingle();

  if (memberErr || !member) return null;

  const orgRole = (member as any).role as OrgRole;
  return {
    id: (member as any).id,
    role: mapOrgRoleToStaffRole(orgRole),
    source: 'organization',
  };
}

async function getPlatformMembership(userId: string): Promise<StoreMembership | null> {
  const { data, error } = await supabaseAdmin
    .from('platform_team')
    .select('id, role')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) return null;

  const platformRole = (data as any).role as PlatformRole;
  return {
    id: (data as any).id,
    role: mapPlatformRoleToStaffRole(platformRole),
    source: 'platform',
  };
}

// 3層フォールバック: store_staff → organization_members → platform_team
async function getStoreMembership(_accessToken: string, storeId: string, userId: string): Promise<StoreMembership | null> {
  // Layer 1: store_staff (既存)
  const staff = await getStoreStaffMembership(storeId, userId);
  if (staff) return staff;

  // Layer 2: organization_members
  const org = await getOrgMembershipForStore(storeId, userId);
  if (org) return org;

  // Layer 3: platform_team
  const platform = await getPlatformMembership(userId);
  if (platform) return platform;

  return null;
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

/**
 * 現在のユーザーがこの店舗で従業員のパスワードをリセットできるかを判定する。
 * staff プラグインの settings.password_reset_roles 設定を読み、
 * 設定値以上のロールを持つスタッフのみ許可する。
 * - 'owner'   → owner のみ
 * - 'manager' → owner + manager  （デフォルト）
 * - 'leader'  → owner + manager + leader
 */
// 組織レベルの管理者権限チェック（owner / admin）
export async function requireOrgManager(
  req: Request, res: Response, orgId: string
): Promise<{ id: string; role: OrgRole } | null> {
  const userId = req.user!.id;
  const { data } = await supabaseAdmin
    .from('organization_members')
    .select('id, role')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!data) {
    res.status(403).json({ error: 'この組織へのアクセス権限がありません' });
    return null;
  }
  const role = (data as any).role as OrgRole;
  if (role !== 'owner' && role !== 'admin') {
    res.status(403).json({ error: '組織の管理権限が必要です' });
    return null;
  }
  return { id: (data as any).id, role };
}

// 組織配下の店舗ID一覧を取得
export async function getOrgStoreIds(orgId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from('stores')
    .select('id')
    .eq('org_id', orgId);

  if (error || !data) return [];
  return (data as any[]).map(s => s.id);
}

export async function canResetStaffPassword(
  storeId: string,
  userRole: StaffRole
): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('store_plugins')
    .select('config')
    .eq('store_id', storeId)
    .eq('plugin_name', 'staff')
    .maybeSingle();

  const threshold: string = data?.config?.password_reset_roles || 'manager';

  const allowedByThreshold: Record<string, StaffRole[]> = {
    owner: ['owner'],
    manager: ['owner', 'manager'],
    leader: ['owner', 'manager', 'leader'],
  };

  const allowed = allowedByThreshold[threshold] || allowedByThreshold.manager;
  return allowed.includes(userRole);
}
