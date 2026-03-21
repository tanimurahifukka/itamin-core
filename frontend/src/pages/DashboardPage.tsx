import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';

export default function DashboardPage() {
  const { selectedStore } = useAuth();
  const [records, setRecords] = useState<any[]>([]);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    if (!selectedStore) return;
    api.getDailyRecords(selectedStore.id, date)
      .then(data => setRecords(data.records))
      .catch(() => {});
  }, [selectedStore, date]);

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

  const calcHours = (record: any) => {
    if (!record.clockOut) return '勤務中';
    const diff = (new Date(record.clockOut).getTime() - new Date(record.clockIn).getTime()) / 3600000;
    const net = diff - (record.breakMinutes || 0) / 60;
    return `${net.toFixed(1)}h`;
  };

  return (
    <div className="main-content">
      <div className="records-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3>日別タイムカード</h3>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #ddd' }}
          />
        </div>

        {records.length === 0 ? (
          <p style={{ color: '#888', textAlign: 'center', padding: 24 }}>この日の記録はありません</p>
        ) : (
          <table className="records-table">
            <thead>
              <tr>
                <th>スタッフ</th>
                <th>出勤</th>
                <th>退勤</th>
                <th>休憩</th>
                <th>実働</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r: any) => (
                <tr key={r.id}>
                  <td>{r.staffName || '—'}</td>
                  <td>{formatTime(r.clockIn)}</td>
                  <td>{r.clockOut ? formatTime(r.clockOut) : '—'}</td>
                  <td>{r.breakMinutes}分</td>
                  <td>{calcHours(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
