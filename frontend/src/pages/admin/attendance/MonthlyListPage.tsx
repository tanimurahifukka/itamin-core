/**
 * A02 月次勤怠一覧
 */
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { api } from '../../../api/client';
import { Badge } from '../../../components/atoms/Badge';
import type { AdminMonthlySummary } from '../../../types/api';
import { Loading } from '../../../components/atoms/Loading';

interface Props {
  onSelectStaff: (userId: string) => void;
}

export default function MonthlyListPage({ onSelectStaff }: Props) {
  const { selectedStore } = useAuth();
  const [summary, setSummary] = useState<AdminMonthlySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [csvError, setCsvError] = useState<string | null>(null);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const storeId = selectedStore?.id;

  const loadSummary = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    const m = `${year}-${String(month).padStart(2, '0')}`;
    try {
      const res = await api.getAdminAttendanceMonthly(storeId, m);
      setSummary(res.summary || []);
    } catch {
      setSummary([]);
    } finally {
      setLoading(false);
    }
  }, [storeId, year, month]);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  };

  const handleCsvDownload = useCallback(async (mode: 'detail' | 'summary') => {
    if (!storeId) return;
    setCsvError(null);
    try {
      const { blob, filename } = await api.exportAttendanceCsv(storeId, year, month, mode);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      // 権限エラー(403)の場合は分かりやすいメッセージを表示
      if (err instanceof Error && 'status' in err && (err as { status: number }).status === 403) {
        setCsvError('CSVエクスポート権限がありません。オーナーまたはマネージャーにご確認ください。');
      } else if (err instanceof Error) {
        setCsvError(`CSVダウンロードに失敗しました: ${err.message}`);
      } else {
        setCsvError('CSVダウンロードに失敗しました。');
      }
    }
  }, [storeId, year, month]);

  return (
    <div className="admin-monthly-list">
      <h2>月次勤怠一覧</h2>

      <div className="attendance-month-nav">
        <button className="button" onClick={prevMonth} data-testid="prev-month-button">◀</button>
        <span className="attendance-month-label">{year}年{month}月</span>
        <button className="button" onClick={nextMonth} data-testid="next-month-button">▶</button>
      </div>

      {csvError && (
        <div className="error-message" role="alert" data-testid="csv-error-message">
          {csvError}
        </div>
      )}

      <div className="attendance-csv-actions" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button
          className="button button-small"
          onClick={() => handleCsvDownload('detail')}
          disabled={loading}
          data-testid="csv-download-detail-button"
        >
          CSVダウンロード（明細）
        </button>
        <button
          className="button button-small"
          onClick={() => handleCsvDownload('summary')}
          disabled={loading}
          data-testid="csv-download-summary-button"
        >
          CSVダウンロード（月次サマリ）
        </button>
      </div>

      {loading ? (
        <Loading />
      ) : (
        <table className="table admin-attendance-table">
          <thead>
            <tr>
              <th>スタッフ</th>
              <th>出勤日数</th>
              <th>総労働時間</th>
              <th>総休憩</th>
              <th>修正申請</th>
              <th>概算給与</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {summary.map((s) => (
              <tr key={s.userId} data-testid="monthly-row">
                <td>{s.staffName}</td>
                <td>{s.workDays}日</td>
                <td>{s.totalWorkHours}h</td>
                <td>{s.totalBreakMinutes}分</td>
                <td>{s.correctionCount > 0 ? <Badge variant="pending">{s.correctionCount}件</Badge> : '—'}</td>
                <td>{s.estimatedSalary != null ? `¥${s.estimatedSalary.toLocaleString()}` : '—'}</td>
                <td>
                  <button
                    className="button button-small"
                    onClick={() => onSelectStaff(s.userId)}
                    data-testid="view-staff-detail-button"
                  >
                    詳細
                  </button>
                </td>
              </tr>
            ))}
            {summary.length === 0 && (
              <tr><td colSpan={7} className="admin-empty">データなし</td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
