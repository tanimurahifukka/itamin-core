import { supabaseAdmin } from '../config/supabase';

export interface PlanLimits {
  max_stores: number;           // -1 = unlimited
  max_staff_per_store: number;  // -1 = unlimited
  max_plugins: number;          // -1 = unlimited
  allowed_plugins: string[];    // empty = all allowed
}

export interface OrgUsage {
  stores: number;
  plugins: number;
}

export interface OrgLimitCheck {
  canAddStore: boolean;
  canEnablePlugin: (pluginName: string) => boolean;
  canAddStaffToStore: (currentStaffCount: number) => boolean;
  usage: OrgUsage;
  limits: PlanLimits;
  planName: string;
}

/**
 * Get effective plan limits for an organization.
 * If no subscription, returns Free plan limits.
 */
export async function getOrgPlanLimits(orgId: string): Promise<{ limits: PlanLimits; planName: string }> {
  const { data: sub } = await supabaseAdmin
    .from('organization_subscriptions')
    .select('plan_id, status')
    .eq('org_id', orgId)
    .eq('status', 'active')
    .maybeSingle();

  interface PlanRow {
    name: string;
    max_stores: number;
    max_staff_per_store: number;
    max_plugins: number;
    allowed_plugins: string[] | null;
  }

  const planSlug = 'free';
  const subRow = sub as { plan_id: string; status: string } | null;
  if (subRow?.plan_id) {
    const { data: plan } = await supabaseAdmin
      .from('plans')
      .select('*')
      .eq('id', subRow.plan_id)
      .maybeSingle();
    if (plan) {
      const p = plan as PlanRow;
      return {
        limits: {
          max_stores: p.max_stores,
          max_staff_per_store: p.max_staff_per_store,
          max_plugins: p.max_plugins,
          allowed_plugins: p.allowed_plugins || [],
        },
        planName: p.name,
      };
    }
  }

  // Fallback: fetch Free plan
  const { data: freePlan } = await supabaseAdmin
    .from('plans')
    .select('*')
    .eq('slug', planSlug)
    .maybeSingle();

  if (freePlan) {
    const fp = freePlan as PlanRow;
    return {
      limits: {
        max_stores: fp.max_stores,
        max_staff_per_store: fp.max_staff_per_store,
        max_plugins: fp.max_plugins,
        allowed_plugins: fp.allowed_plugins || [],
      },
      planName: fp.name,
    };
  }

  // Ultimate fallback
  return {
    limits: { max_stores: 1, max_staff_per_store: 5, max_plugins: 3, allowed_plugins: [] },
    planName: 'Free',
  };
}

export async function checkOrgLimits(orgId: string): Promise<OrgLimitCheck> {
  const { limits, planName } = await getOrgPlanLimits(orgId);

  // Current store count
  const { count: storeCount } = await supabaseAdmin
    .from('stores')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId);

  // Total enabled plugins across all org stores
  const { data: storeIds } = await supabaseAdmin
    .from('stores')
    .select('id')
    .eq('org_id', orgId);

  const ids = (storeIds || []).map((s: { id: string }) => s.id);
  let pluginCount = 0;
  if (ids.length > 0) {
    const { count: pCount } = await supabaseAdmin
      .from('store_plugins')
      .select('id', { count: 'exact', head: true })
      .in('store_id', ids)
      .eq('enabled', true);
    pluginCount = pCount || 0;
  }

  const usage: OrgUsage = {
    stores: storeCount || 0,
    plugins: pluginCount,
  };

  return {
    usage,
    limits,
    planName,
    canAddStore: limits.max_stores === -1 || usage.stores < limits.max_stores,
    canEnablePlugin: (pluginName: string) => {
      if (limits.allowed_plugins.length > 0 && !limits.allowed_plugins.includes(pluginName)) {
        return false;
      }
      return limits.max_plugins === -1 || usage.plugins < limits.max_plugins;
    },
    canAddStaffToStore: (currentStaffCount: number) => {
      return limits.max_staff_per_store === -1 || currentStaffCount < limits.max_staff_per_store;
    },
  };
}
