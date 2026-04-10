import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';
import { supabase } from '../api/supabase';
import { showToast } from '../components/Toast';
import type { SalesClose, SalesReceipt, CashClose } from '../types/api';

type Tab = 'close' | 'receipts' | 'cash';

export default function SalesCapturePage() {
  const { selectedStore } = useAuth();
  const isOwner = selectedStore?.role === 'owner';
  const isManager = selectedStore?.role === 'manager';
  const canManage = isOwner || isManager || selectedStore?.role === 'leader';
  const [tab, setTab] = useState<Tab>('close');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  // 売上締め
  const [closeData, setCloseData] = useState<SalesClose | null>(null);
  const [grossSales, setGrossSales] = useState('');
  const [netSales, setNetSales] = useState('');
  const [taxAmount, setTaxAmount] = useState('');
  const [cashSales, setCashSales] = useState('');
  const [cardSales, setCardSales] = useState('');
  const [qrSales, setQrSales] = useState('');
  const [receiptCount, setReceiptCount] = useState('');
  const [closeSaving, setCloseSaving] = useState(false);

  // レシート
  const [receipts, setReceipts] = useState<SalesReceipt[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // 現金締め
  const [, setCashCloseData] = useState<CashClose | null>(null);
  const [expectedCash, setExpectedCash] = useState('');
  const [countedCash, setCountedCash] = useState('');
  const [cashNote, setCashNote] = useState('');
  const [cashSaving, setCashSaving] = useState(false);

  // 売上締めデータ読込
  useEffect(() => {
    if (!selectedStore) return;
    api.getSalesClose(selectedStore.id, date).then(data => {
      setCloseData(data.close);
      if (data.close) {
        setGrossSales(String(data.close.grossSales || ''));
        setNetSales(String(data.close.netSales || ''));
        setTaxAmount(String(data.close.taxAmount || ''));
        setCashSales(String(data.close.cashSales || ''));
        setCardSales(String(data.close.cardSales || ''));
        setQrSales(String(data.close.qrSales || ''));
        setReceiptCount(String(data.close.receiptCount || ''));
      } else {
        setGrossSales(''); setNetSales(''); setTaxAmount('');
        setCashSales(''); setCardSales(''); setQrSales(''); setReceiptCount('');
      }
    }).catch(() => {});
  }, [selectedStore, date]);

  // レシート読込
  useEffect(() => {
    if (!selectedStore) return;
    api.getSalesReceipts(selectedStore.id, date)
      .then(data => setReceipts(data.receipts || []))
      .catch(() => {});
  }, [selectedStore, date]);

  // 現金締め読込
  useEffect(() => {
    if (!selectedStore) return;
    api.getCashClose(selectedStore.id, date).then(data => {
      setCashCloseData(data.cashClose);
      if (data.cashClose) {
        setExpectedCash(String(data.cashClose.expectedCash || ''));
        setCountedCash(String(data.cashClose.countedCash || ''));
        setCashNote(data.cashClose.note || '');
      } else {
        setExpectedCash(''); setCountedCash(''); setCashNote('');
      }
    }).catch(() => {});
  }, [selectedStore, date]);

  // 売上締め保存
  const handleCloseSave = async () => {
    if (!selectedStore || closeSaving) return;
    setCloseSaving(true);
    try {
      await api.saveSalesClose(selectedStore.id, {
        businessDate: date,
        grossSales: Number(grossSales) || 0,
        netSales: Number(netSales) || Number(grossSales) || 0,
        taxAmount: Number(taxAmount) || 0,
        cashSales: Number(cashSales) || 0,
        cardSales: Number(cardSales) || 0,
        qrSales: Number(qrSales) || 0,
        receiptCount: Number(receiptCount) || 0,
      });
      showToast('売上を保存しました', 'success');
      // 再読み込み
      const data = await api.getSalesClose(selectedStore.id, date);
      setCloseData(data.close);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '保存に失敗しました', 'error');
    } finally {
      setCloseSaving(false);
    }
  };

  // 売上承認
  const handleApprove = async () => {
    if (!selectedStore) return;
    try {
      await api.approveSalesClose(selectedStore.id, date);
      showToast('売上を承認しました', 'success');
      const data = await api.getSalesClose(selectedStore.id, date);
      setCloseData(data.close);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '承認に失敗しました', 'error');
    }
  };

  // レシートアップロード
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedStore) return;
    setUploading(true);
    try {
      // 署名付きURL取得
      const urlData = await api.getUploadUrl(selectedStore.id, file.name, file.type);

      // Supabase Storageにアップロード
      const { error } = await supabase.storage
        .from('sales-receipts')
        .uploadToSignedUrl(urlData.path, urlData.token, file, {
          contentType: file.type,
        });

      if (error) throw error;

      // メタデータ登録
      await api.createSalesReceipt(selectedStore.id, {
        businessDate: date,
        filePath: urlData.path,
        fileName: file.name,
      });

      showToast('レシートをアップロードしました', 'success');
      const data = await api.getSalesReceipts(selectedStore.id, date);
      setReceipts(data.receipts || []);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'アップロード失敗', 'error');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // 現金締め保存
  const handleCashSave = async () => {
    if (!selectedStore || cashSaving) return;
    setCashSaving(true);
    try {
      await api.saveCashClose(selectedStore.id, {
        businessDate: date,
        expectedCash: Number(expectedCash) || 0,
        countedCash: Number(countedCash) || 0,
        note: cashNote,
      });
      showToast('現金締めを保存しました', 'success');
      const data = await api.getCashClose(selectedStore.id, date);
      setCashCloseData(data.cashClose);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '保存に失敗しました', 'error');
    } finally {
      setCashSaving(false);
    }
  };

  const overShort = (Number(countedCash) || 0) - (Number(expectedCash) || 0);

  return (
    <>
      {/* 日付選択 + タブ */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="date-picker"
          data-testid="sales-date-picker"
        />
        {closeData?.approvedAt && (
          <span style={{ fontSize: '0.8rem', color: '#16a34a', fontWeight: 600 }}>承認済み</span>
        )}
      </div>

      <div className="view-mode-tabs">
        <button className={`view-mode-tab ${tab === 'close' ? 'active' : ''}`} onClick={() => setTab('close')}>
          売上締め
        </button>
        <button className={`view-mode-tab ${tab === 'receipts' ? 'active' : ''}`} onClick={() => setTab('receipts')}>
          証跡
        </button>
        <button className={`view-mode-tab ${tab === 'cash' ? 'active' : ''}`} onClick={() => setTab('cash')}>
          現金締め
        </button>
      </div>

      {/* 売上締めフォーム */}
      {tab === 'close' && (
        <div className="records-section">
          <h3 style={{ marginBottom: 16 }}>売上締め — {date}</h3>

          <div className="daily-report-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            <div>
              <label className="form-label">総売上</label>
              <input type="number" className="form-input" value={grossSales} onChange={e => setGrossSales(e.target.value)} placeholder="0" data-testid="gross-sales-input" />
            </div>
            <div>
              <label className="form-label">純売上</label>
              <input type="number" className="form-input" value={netSales} onChange={e => setNetSales(e.target.value)} placeholder="0" data-testid="net-sales-input" />
            </div>
            <div>
              <label className="form-label">消費税</label>
              <input type="number" className="form-input" value={taxAmount} onChange={e => setTaxAmount(e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className="form-label">レシート件数</label>
              <input type="number" className="form-input" value={receiptCount} onChange={e => setReceiptCount(e.target.value)} placeholder="0" />
            </div>
          </div>

          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: 8 }}>支払方法別</div>
          <div className="daily-report-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
            <div>
              <label className="form-label">現金</label>
              <input type="number" className="form-input" value={cashSales} onChange={e => setCashSales(e.target.value)} placeholder="0" data-testid="cash-sales-input" />
            </div>
            <div>
              <label className="form-label">カード</label>
              <input type="number" className="form-input" value={cardSales} onChange={e => setCardSales(e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className="form-label">QR決済</label>
              <input type="number" className="form-input" value={qrSales} onChange={e => setQrSales(e.target.value)} placeholder="0" />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleCloseSave}
              disabled={closeSaving}
              style={{ flex: 1, padding: '10px 20px', borderRadius: 8, border: 'none', background: '#2563eb', color: 'white', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600, fontFamily: 'inherit' }}
              data-testid="save-close-btn"
            >
              {closeSaving ? '保存中...' : '保存'}
            </button>
            {canManage && closeData && !closeData.approvedAt && (
              <button
                onClick={handleApprove}
                style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #16a34a', background: 'white', color: '#16a34a', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600, fontFamily: 'inherit' }}
                data-testid="approve-close-btn"
              >
                承認
              </button>
            )}
          </div>
        </div>
      )}

      {/* レシート証跡 */}
      {tab === 'receipts' && (
        <div className="records-section">
          <h3 style={{ marginBottom: 16 }}>レシート証跡 — {date}</h3>

          <div style={{ marginBottom: 16 }}>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.pdf"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
              data-testid="receipt-file-input"
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              style={{ padding: '10px 20px', borderRadius: 8, border: '2px dashed #d4d9df', background: 'white', color: '#2563eb', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600, fontFamily: 'inherit', width: '100%' }}
              data-testid="upload-receipt-btn"
            >
              {uploading ? 'アップロード中...' : 'レシート画像をアップロード'}
            </button>
          </div>

          {receipts.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🧾</div>
              <p className="empty-state-text">この日のレシートはまだありません</p>
              <p className="empty-state-hint">締めレシートや精算票をアップロードできます</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {receipts.map((r) => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'white', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{r.fileName}</div>
                    <div style={{ fontSize: '0.8rem', color: '#888' }}>
                      {r.uploadedByName} — {new Date(r.uploadedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: 12,
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    background: r.status === 'confirmed' ? '#dcfce7' : r.status === 'uploaded' ? '#fef3c7' : '#f3f4f6',
                    color: r.status === 'confirmed' ? '#166534' : r.status === 'uploaded' ? '#92400e' : '#374151',
                  }}>
                    {r.status === 'confirmed' ? '確認済み' : r.status === 'uploaded' ? '未確認' : r.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 現金締め */}
      {tab === 'cash' && (
        <div className="records-section">
          <h3 style={{ marginBottom: 16 }}>現金締め — {date}</h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            <div>
              <label className="form-label">レジ精算額（期待値）</label>
              <input type="number" className="form-input" value={expectedCash} onChange={e => setExpectedCash(e.target.value)} placeholder="0" data-testid="expected-cash-input" />
            </div>
            <div>
              <label className="form-label">実数カウント</label>
              <input type="number" className="form-input" value={countedCash} onChange={e => setCountedCash(e.target.value)} placeholder="0" data-testid="counted-cash-input" />
            </div>
          </div>

          {/* 過不足表示 */}
          {(expectedCash || countedCash) && (
            <div style={{
              padding: '12px 16px',
              borderRadius: 8,
              marginBottom: 16,
              background: overShort === 0 ? '#f0fdf4' : '#fef2f2',
              border: `1px solid ${overShort === 0 ? '#bbf7d0' : '#fecaca'}`,
            }}>
              <div style={{ fontSize: '0.85rem', color: '#374151', marginBottom: 4 }}>過不足</div>
              <div style={{
                fontSize: '1.4rem',
                fontWeight: 700,
                color: overShort === 0 ? '#16a34a' : overShort > 0 ? '#2563eb' : '#dc2626',
              }}>
                {overShort > 0 ? '+' : ''}{overShort.toLocaleString()}円
              </div>
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <label className="form-label">メモ</label>
            <input type="text" className="form-input" value={cashNote} onChange={e => setCashNote(e.target.value)} placeholder="過不足の理由など" data-testid="cash-note-input" />
          </div>

          <button
            onClick={handleCashSave}
            disabled={cashSaving}
            style={{ width: '100%', padding: '10px 20px', borderRadius: 8, border: 'none', background: '#2563eb', color: 'white', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600, fontFamily: 'inherit' }}
            data-testid="save-cash-close-btn"
          >
            {cashSaving ? '保存中...' : '保存'}
          </button>
        </div>
      )}
    </>
  );
}
