/**
 * A06 勤怠ポリシー設定
 */
import { useState, useEffect } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { api } from '../../../api/client';

interface AttendancePolicy {
  timezone: string;
  business_day_cutoff_hour?: number;
  rounding_unit_minutes?: number;
  rounding_mode?: string;
  auto_close_break_before_clock_out?: boolean;
  require_manager_approval?: boolean;
}

export default function PolicySettingsPage() {
  const { selectedStore } = useAuth();
  const [policy, setPolicy] = useState<AttendancePolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const storeId = selectedStore?.id;

  useEffect(() => {
    if (!storeId) return;
    setLoading(true);
    api.getAttendancePolicy(storeId)
      .then(res => setPolicy(res.policy))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [storeId]);

  const handleSave = async () => {
    if (!storeId || !policy) return;
    setSaving(true);
    try {
      const res = await api.updateAttendancePolicy(storeId, {
        timezone: policy.timezone,
        businessDayCutoffHour: policy.business_day_cutoff_hour,
        roundingUnitMinutes: policy.rounding_unit_minutes,
        roundingMode: policy.rounding_mode,
        autoCloseBreakBeforeClockOut: policy.auto_close_break_before_clock_out,
        requireManagerApproval: policy.require_manager_approval,
      });
      setPolicy(res.policy);
      setToast('保存しました');
      setTimeout(() => setToast(''), 3000);
    } catch (e: unknown) {
      const err = e as { body?: { error?: string }; message?: string };
      alert(err.body?.error || 'エラーが発生しました');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="loading">読み込み中...</div>;
  if (!policy) return <div className="alert alert-error">ポリシーの取得に失敗しました</div>;

  return (
    <div className="admin-policy-settings">
      <h2>勤怠ポリシー設定</h2>

      {toast && <div className="alert alert-success">{toast}</div>}

      <div className="form-group">
        <label className="form-label">タイムゾーン</label>
        <input
          className="form-input"
          value={policy.timezone}
          onChange={e => setPolicy({ ...policy, timezone: e.target.value })}
          data-testid="policy-timezone-input"
        />
      </div>

      <div className="form-group">
        <label className="form-label">営業日切替時刻（0〜23）</label>
        <input
          className="form-input"
          type="number"
          min={0}
          max={23}
          value={policy.business_day_cutoff_hour}
          onChange={e => setPolicy({ ...policy, business_day_cutoff_hour: parseInt(e.target.value) || 0 })}
          data-testid="policy-cutoff-input"
        />
      </div>

      <div className="form-group">
        <label className="form-label">丸め単位（分）</label>
        <input
          className="form-input"
          type="number"
          min={1}
          value={policy.rounding_unit_minutes}
          onChange={e => setPolicy({ ...policy, rounding_unit_minutes: parseInt(e.target.value) || 1 })}
          data-testid="policy-rounding-input"
        />
      </div>

      <div className="form-group">
        <label className="form-label">丸め方式</label>
        <select
          className="form-input"
          value={policy.rounding_mode}
          onChange={e => setPolicy({ ...policy, rounding_mode: e.target.value })}
          data-testid="policy-rounding-mode-select"
        >
          <option value="none">なし</option>
          <option value="round">四捨五入</option>
          <option value="floor">切り捨て</option>
          <option value="ceil">切り上げ</option>
        </select>
      </div>

      <div className="form-group">
        <label className="form-label">
          <input
            type="checkbox"
            checked={!!policy.auto_close_break_before_clock_out}
            onChange={e => setPolicy({ ...policy, auto_close_break_before_clock_out: e.target.checked })}
            data-testid="policy-auto-close-break-checkbox"
          />
          {' '}退勤時に休憩を自動終了する
        </label>
      </div>

      <div className="form-group">
        <label className="form-label">
          <input
            type="checkbox"
            checked={!!policy.require_manager_approval}
            onChange={e => setPolicy({ ...policy, require_manager_approval: e.target.checked })}
            data-testid="policy-require-approval-checkbox"
          />
          {' '}修正申請に管理者承認を必須にする
        </label>
      </div>

      <button
        className="button button-primary"
        onClick={handleSave}
        disabled={saving}
        data-testid="save-policy-button"
      >
        {saving ? '保存中...' : '設定を保存'}
      </button>
    </div>
  );
}
