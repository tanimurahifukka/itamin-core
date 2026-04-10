import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';
import { showToast } from '../components/Toast';
import type { PaidLeaveSummary, LeaveRecord, StaffMember } from '../types/api';

export default function PaidLeavePage() {
  const { selectedStore } = useAuth();
  const [summary, setSummary] = useState<PaidLeaveSummary[]>([]);
  const [records, setRecords] = useState<LeaveRecord[]>([]);
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear());
  const [selectedStaffId, setSelectedStaffId] = useState<string>('');

  // 付与フォーム
  const [grantStaffId, setGrantStaffId] = useState('');
  const [grantDays, setGrantDays] = useState('10');

  // 取得記録フォーム
  const [recordStaffId, setRecordStaffId] = useState('');
  const [recordDate, setRecordDate] = useState(new Date().toISOString().split('T')[0]);
  const [recordType, setRecordType] = useState('全日');
  const [recordNote, setRecordNote] = useState('');

  // スタッフ一覧
  const [staffList, setStaffList] = useState<StaffMember[]>([]);

  useEffect(() => {
    if (!selectedStore) return;
    api.getStoreStaff(selectedStore.id)
      .then(data => setStaffList(data.staff || []))
      .catch(() => {});
  }, [selectedStore]);

  const loadSummary = useCallback(() => {
    if (!selectedStore) return;
    api.getPaidLeaveSummary(selectedStore.id, fiscalYear)
      .then(data => setSummary(data.summary))
      .catch(() => {});
  }, [selectedStore, fiscalYear]);

  const loadRecords = useCallback(() => {
    if (!selectedStore) return;
    api.getLeaveRecords(selectedStore.id, selectedStaffId || undefined)
      .then(data => setRecords(data.records))
      .catch(() => {});
  }, [selectedStore, selectedStaffId]);

  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { loadRecords(); }, [loadRecords]);

  const handleGrant = async () => {
    if (!selectedStore || !grantStaffId) return;
    try {
      await api.grantPaidLeave(selectedStore.id, { staffId: grantStaffId, totalDays: Number(grantDays), fiscalYear });
      showToast('有給を付与しました', 'success');
      setGrantStaffId('');
      loadSummary();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '付与に失敗しました', 'error');
    }
  };

  const handleAddRecord = async () => {
    if (!selectedStore || !recordStaffId || !recordDate) return;
    try {
      await api.addLeaveRecord(selectedStore.id, {
        staffId: recordStaffId,
        date: recordDate,
        type: recordType,
        note: recordNote,
      });
      showToast('取得記録を追加しました', 'success');
      setRecordNote('');
      loadRecords();
      loadSummary();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '追加に失敗しました', 'error');
    }
  };

  const handleDeleteRecord = async (recordId: string) => {
    if (!selectedStore) return;
    if (!confirm('この取得記録を削除しますか？')) return;
    try {
      await api.deleteLeaveRecord(selectedStore.id, recordId);
      showToast('削除しました', 'info');
      loadRecords();
      loadSummary();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '削除に失敗しました', 'error');
    }
  };

  return (
    <div className="main-content">
      {/* 年度選択 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={() => setFiscalYear(y => y - 1)} style={{ padding: '4px 12px', border: '1px solid #d4d9df', borderRadius: 6, background: 'white', cursor: 'pointer' }}>◀</button>
        <span style={{ fontSize: '1.1rem', fontWeight: 600 }}>{fiscalYear}年度</span>
        <button onClick={() => setFiscalYear(y => y + 1)} style={{ padding: '4px 12px', border: '1px solid #d4d9df', borderRadius: 6, background: 'white', cursor: 'pointer' }}>▶</button>
      </div>

      {/* 残日数一覧 */}
      <div className="records-section" style={{ marginBottom: 16 }}>
        <h3 style={{ marginBottom: 12 }}>スタッフ別有給残日数</h3>
        {summary.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🏖️</div>
            <p className="empty-state-text">有給データがありません</p>
            <p className="empty-state-hint">下のフォームから有給を付与してください</p>
          </div>
        ) : (
          <table className="records-table">
            <thead>
              <tr>
                <th>スタッフ名</th>
                <th>付与日数</th>
                <th>使用日数</th>
                <th>残日数</th>
              </tr>
            </thead>
            <tbody>
              {summary.map(s => (
                <tr key={s.id} style={s.remainingDays <= 2 ? { background: '#fffbeb' } : {}}>
                  <td style={{ fontWeight: 500 }}>{s.staffName}</td>
                  <td>{s.totalDays}日</td>
                  <td>{s.usedDays}日</td>
                  <td style={{ fontWeight: 700, color: s.remainingDays <= 0 ? '#dc2626' : s.remainingDays <= 2 ? '#f59e0b' : '#22c55e' }}>
                    {s.remainingDays}日
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 有給付与フォーム */}
      <div className="records-section" style={{ marginBottom: 16 }}>
        <h3 style={{ marginBottom: 12 }}>有給付与</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'end' }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '0.8rem', color: '#666', marginBottom: 2, display: 'block' }}>スタッフ</label>
            <select
              value={grantStaffId}
              onChange={e => setGrantStaffId(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #d4d9df', borderRadius: 6, fontFamily: 'inherit', fontSize: '0.9rem' }}
            >
              <option value="">選択してください</option>
              {staffList.map((s) => (
                <option key={s.userId} value={s.userId}>{s.userName || s.email}</option>
              ))}
            </select>
          </div>
          <div style={{ width: 100 }}>
            <label style={{ fontSize: '0.8rem', color: '#666', marginBottom: 2, display: 'block' }}>日数</label>
            <input
              type="number"
              value={grantDays}
              onChange={e => setGrantDays(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #d4d9df', borderRadius: 6, fontFamily: 'inherit', fontSize: '0.9rem' }}
            />
          </div>
          <button
            onClick={handleGrant}
            disabled={!grantStaffId}
            style={{ padding: '8px 20px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500, fontFamily: 'inherit', fontSize: '0.9rem', height: 38 }}
          >
            付与
          </button>
        </div>
      </div>

      {/* 取得記録登録フォーム */}
      <div className="records-section" style={{ marginBottom: 16 }}>
        <h3 style={{ marginBottom: 12 }}>取得記録の登録</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 150 }}>
            <label style={{ fontSize: '0.8rem', color: '#666', marginBottom: 2, display: 'block' }}>スタッフ</label>
            <select
              value={recordStaffId}
              onChange={e => setRecordStaffId(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #d4d9df', borderRadius: 6, fontFamily: 'inherit', fontSize: '0.9rem' }}
            >
              <option value="">選択してください</option>
              {staffList.map((s) => (
                <option key={s.userId} value={s.userId}>{s.userName || s.email}</option>
              ))}
            </select>
          </div>
          <div style={{ width: 140 }}>
            <label style={{ fontSize: '0.8rem', color: '#666', marginBottom: 2, display: 'block' }}>日付</label>
            <input
              type="date"
              value={recordDate}
              onChange={e => setRecordDate(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #d4d9df', borderRadius: 6, fontFamily: 'inherit', fontSize: '0.9rem' }}
            />
          </div>
          <div style={{ width: 100 }}>
            <label style={{ fontSize: '0.8rem', color: '#666', marginBottom: 2, display: 'block' }}>種別</label>
            <select
              value={recordType}
              onChange={e => setRecordType(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #d4d9df', borderRadius: 6, fontFamily: 'inherit', fontSize: '0.9rem' }}
            >
              <option value="全日">全日</option>
              <option value="半日">半日</option>
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 120 }}>
            <label style={{ fontSize: '0.8rem', color: '#666', marginBottom: 2, display: 'block' }}>備考</label>
            <input
              type="text"
              placeholder="備考"
              value={recordNote}
              onChange={e => setRecordNote(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #d4d9df', borderRadius: 6, fontFamily: 'inherit', fontSize: '0.9rem' }}
            />
          </div>
          <button
            onClick={handleAddRecord}
            disabled={!recordStaffId || !recordDate}
            style={{ padding: '8px 20px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500, fontFamily: 'inherit', fontSize: '0.9rem', height: 38 }}
          >
            登録
          </button>
        </div>
      </div>

      {/* 取得記録一覧 */}
      <div className="records-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3>取得記録</h3>
          <select
            value={selectedStaffId}
            onChange={e => setSelectedStaffId(e.target.value)}
            style={{ padding: '6px 12px', border: '1px solid #d4d9df', borderRadius: 6, fontFamily: 'inherit', fontSize: '0.85rem' }}
          >
            <option value="">全スタッフ</option>
            {staffList.map((s) => (
              <option key={s.userId} value={s.userId}>{s.userName || s.email}</option>
            ))}
          </select>
        </div>
        {records.length === 0 ? (
          <p style={{ color: '#888', fontSize: '0.9rem' }}>取得記録はありません</p>
        ) : (
          <table className="records-table">
            <thead>
              <tr>
                <th>日付</th>
                <th>種別</th>
                <th>備考</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.date + 'T00:00:00').toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', weekday: 'short' })}</td>
                  <td>{r.type}</td>
                  <td style={{ fontSize: '0.85rem', color: '#666' }}>{r.note || '—'}</td>
                  <td>
                    <button
                      onClick={() => handleDeleteRecord(r.id)}
                      style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '1rem', padding: '4px 8px' }}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
