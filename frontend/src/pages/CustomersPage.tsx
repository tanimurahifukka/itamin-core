import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';
import { showToast } from '../components/molecules/Toast';
import type { Customer, ReservationRow } from '../types/api';

const PAGE_LIMIT = 20;

interface FormData {
  name: string;
  name_kana: string;
  phone: string;
  email: string;
  birthday: string;
  tags: string;
  note: string;
}

const emptyForm: FormData = {
  name: '',
  name_kana: '',
  phone: '',
  email: '',
  birthday: '',
  tags: '',
  note: '',
};

function formatDate(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

export default function CustomersPage() {
  const { selectedStore } = useAuth();
  const storeId = selectedStore?.id;
  const role = selectedStore?.role;
  const canDelete = role === 'owner' || role === 'manager';

  // List state
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [offset, setOffset] = useState(0);

  // Detail view
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // Form modal
  const [formOpen, setFormOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [formData, setFormData] = useState<FormData>(emptyForm);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  // Debounce timer ref
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Collect all tags from current customers list
  const allTags = Array.from(new Set(customers.flatMap(c => c.tags))).sort();

  const loadCustomers = useCallback(async (q: string, tag: string, off: number) => {
    if (!storeId) return;
    setLoading(true);
    try {
      const result = await api.getCustomers(storeId, {
        q: q || undefined,
        tag: tag || undefined,
        limit: PAGE_LIMIT,
        offset: off,
      });
      setCustomers(result.data);
      setTotal(result.total);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '読み込みに失敗しました', 'error');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    loadCustomers(searchQuery, selectedTag, offset);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  // CRM-3: Auto-select customer from URL ?id parameter
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (id && selectedStore) {
      (async () => {
        try {
          const customer = await api.getCustomer(selectedStore.id, id);
          if (customer) setSelectedCustomer(customer);
        } catch {
          // Customer not found, ignore
        }
      })();
    }
  }, [selectedStore]);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setOffset(0);
      loadCustomers(value, selectedTag, 0);
    }, 300);
  };

  const handleTagFilter = (tag: string) => {
    setSelectedTag(tag);
    setOffset(0);
    loadCustomers(searchQuery, tag, 0);
  };

  const handlePrev = () => {
    const newOffset = Math.max(0, offset - PAGE_LIMIT);
    setOffset(newOffset);
    loadCustomers(searchQuery, selectedTag, newOffset);
  };

  const handleNext = () => {
    const newOffset = offset + PAGE_LIMIT;
    setOffset(newOffset);
    loadCustomers(searchQuery, selectedTag, newOffset);
  };

  // Open new form
  const handleNewCustomer = () => {
    setEditingCustomer(null);
    setFormData(emptyForm);
    setDuplicateWarning(null);
    setFormOpen(true);
  };

  // Open edit form
  const handleEditCustomer = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormData({
      name: customer.name,
      name_kana: customer.name_kana || '',
      phone: customer.phone || '',
      email: customer.email || '',
      birthday: customer.birthday || '',
      tags: customer.tags.join(', '),
      note: customer.note || '',
    });
    setDuplicateWarning(null);
    setFormOpen(true);
  };

  const handleCloseForm = () => {
    setFormOpen(false);
    setEditingCustomer(null);
    setFormData(emptyForm);
    setDuplicateWarning(null);
  };

  const handlePhoneBlur = async () => {
    if (!storeId || !formData.phone.trim()) {
      setDuplicateWarning(null);
      return;
    }
    // If editing, skip duplicate check for the same customer
    try {
      const result = await api.checkCustomerDuplicate(storeId, formData.phone.trim());
      if (result.exists && result.customer) {
        if (editingCustomer && result.customer.id === editingCustomer.id) {
          setDuplicateWarning(null);
        } else {
          setDuplicateWarning(`この電話番号はすでに「${result.customer.name}」として登録されています`);
        }
      } else {
        setDuplicateWarning(null);
      }
    } catch {
      // Silently ignore duplicate check errors
    }
  };

  const handleFormSubmit = async () => {
    if (!storeId || !formData.name.trim() || formSubmitting) return;
    setFormSubmitting(true);
    try {
      const payload = {
        name: formData.name.trim(),
        name_kana: formData.name_kana.trim() || null,
        phone: formData.phone.trim() || null,
        email: formData.email.trim() || null,
        birthday: formData.birthday || null,
        tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean),
        note: formData.note.trim() || null,
      };
      if (editingCustomer) {
        const updated = await api.updateCustomer(storeId, editingCustomer.id, payload);
        showToast('更新しました', 'success');
        // If we were in detail view, refresh the selected customer
        if (selectedCustomer?.id === updated.id) {
          setSelectedCustomer(updated);
        }
      } else {
        await api.createCustomer(storeId, payload);
        showToast('登録しました', 'success');
      }
      handleCloseForm();
      loadCustomers(searchQuery, selectedTag, offset);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '保存に失敗しました', 'error');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDeleteCustomer = async (customer: Customer) => {
    if (!storeId) return;
    if (!window.confirm(`「${customer.name}」を削除しますか？この操作は元に戻せません。`)) return;
    try {
      await api.deleteCustomer(storeId, customer.id);
      showToast('削除しました', 'info');
      setSelectedCustomer(null);
      loadCustomers(searchQuery, selectedTag, offset);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '削除に失敗しました', 'error');
    }
  };

  // ── Detail View ────────────────────────────────────────────
  if (selectedCustomer) {
    return (
      <div className="main-content">
        <div style={{ marginBottom: 16 }}>
          <button
            onClick={() => setSelectedCustomer(null)}
            style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: '0.95rem', padding: '4px 0', fontFamily: 'inherit' }}
          >
            ← 戻る
          </button>
        </div>

        <div className="records-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ margin: 0, fontSize: '1.25rem' }}>{selectedCustomer.name}</h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => handleEditCustomer(selectedCustomer)}
                style={{ padding: '6px 16px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.9rem' }}
              >
                編集
              </button>
              {canDelete && (
                <button
                  onClick={() => handleDeleteCustomer(selectedCustomer)}
                  style={{ padding: '6px 16px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.9rem' }}
                >
                  削除
                </button>
              )}
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {[
                { label: 'ふりがな', value: selectedCustomer.name_kana || '—' },
                { label: '電話番号', value: selectedCustomer.phone || '—' },
                { label: 'メール', value: selectedCustomer.email || '—' },
                { label: '誕生日', value: selectedCustomer.birthday ? new Date(selectedCustomer.birthday + 'T00:00:00').toLocaleDateString('ja-JP') : '—' },
                { label: 'タグ', value: selectedCustomer.tags.length > 0 ? selectedCustomer.tags.join('、') : '—' },
                { label: 'メモ', value: selectedCustomer.note || '—' },
                { label: '登録日', value: formatDate(selectedCustomer.created_at) },
                { label: '更新日', value: formatDate(selectedCustomer.updated_at) },
              ].map(row => (
                <tr key={row.label} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '10px 0', width: 120, color: '#666', fontSize: '0.875rem', verticalAlign: 'top' }}>{row.label}</td>
                  <td style={{ padding: '10px 0', fontSize: '0.95rem' }}>{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 予約履歴 (CRM-1) */}
        <CustomerReservationHistory storeId={selectedStore!.id} customerId={selectedCustomer.id} />

        {/* Form Modal (Edit) */}
        {formOpen && (
          <CustomerFormModal
            editingCustomer={editingCustomer}
            formData={formData}
            formSubmitting={formSubmitting}
            duplicateWarning={duplicateWarning}
            onChange={(field, value) => setFormData(prev => ({ ...prev, [field]: value }))}
            onPhoneBlur={handlePhoneBlur}
            onSubmit={handleFormSubmit}
            onClose={handleCloseForm}
          />
        )}
      </div>
    );
  }

  // ── List View ───────────────────────────────────────────────
  return (
    <div className="main-content">
      {/* ヘッダー操作エリア */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          <input
            type="text"
            placeholder="名前・電話番号・メールで検索"
            value={searchQuery}
            onChange={e => handleSearchChange(e.target.value)}
            style={{
              flex: 1,
              maxWidth: 320,
              padding: '8px 12px',
              border: '1px solid #d4d9df',
              borderRadius: 6,
              fontFamily: 'inherit',
              fontSize: '0.9rem',
            }}
          />
        </div>
        <button
          onClick={handleNewCustomer}
          style={{
            padding: '8px 16px',
            background: '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            fontWeight: 500,
            fontFamily: 'inherit',
            fontSize: '0.9rem',
            whiteSpace: 'nowrap',
          }}
        >
          + 新規登録
        </button>
      </div>

      {/* タグフィルター */}
      {allTags.length > 0 && (
        <div className="timing-tabs" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
          <button
            className={`timing-tab ${selectedTag === '' ? 'active' : ''}`}
            onClick={() => handleTagFilter('')}
          >
            すべて
          </button>
          {allTags.map(tag => (
            <button
              key={tag}
              className={`timing-tab ${selectedTag === tag ? 'active' : ''}`}
              onClick={() => handleTagFilter(tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* テーブル */}
      <div className="records-section">
        {loading ? (
          <div className="loading" style={{ minHeight: '30vh' }}>読み込み中...</div>
        ) : customers.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">👤</div>
            <p className="empty-state-text">顧客が登録されていません</p>
            <p className="empty-state-hint">「+ 新規登録」から顧客を追加してください</p>
          </div>
        ) : (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                  {['名前', 'ふりがな', '電話番号', 'タグ', '登録日'].map(h => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: '0.8rem', color: '#666', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {customers.map(customer => (
                  <tr
                    key={customer.id}
                    onClick={() => setSelectedCustomer(customer)}
                    style={{ borderBottom: '1px solid #f0f0f0', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                  >
                    <td style={{ padding: '10px 10px', fontSize: '0.95rem', fontWeight: 500 }}>{customer.name}</td>
                    <td style={{ padding: '10px 10px', fontSize: '0.85rem', color: '#666' }}>{customer.name_kana || '—'}</td>
                    <td style={{ padding: '10px 10px', fontSize: '0.85rem' }}>{customer.phone || '—'}</td>
                    <td style={{ padding: '10px 10px' }}>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {customer.tags.map(tag => (
                          <span
                            key={tag}
                            style={{ padding: '2px 8px', background: '#eff6ff', color: '#2563eb', borderRadius: 12, fontSize: '0.75rem', fontWeight: 500 }}
                          >
                            {tag}
                          </span>
                        ))}
                        {customer.tags.length === 0 && <span style={{ color: '#bbb', fontSize: '0.8rem' }}>—</span>}
                      </div>
                    </td>
                    <td style={{ padding: '10px 10px', fontSize: '0.8rem', color: '#888', whiteSpace: 'nowrap' }}>
                      {formatDate(customer.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* ページネーション */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontSize: '0.85rem', color: '#666' }}>
                全{total}件中 {total === 0 ? 0 : offset + 1}〜{Math.min(offset + customers.length, total)}件
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={handlePrev}
                  disabled={offset === 0}
                  style={{
                    padding: '6px 14px',
                    border: '1px solid #d4d9df',
                    borderRadius: 6,
                    background: offset === 0 ? '#f3f4f6' : 'white',
                    color: offset === 0 ? '#bbb' : '#333',
                    cursor: offset === 0 ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit',
                    fontSize: '0.85rem',
                  }}
                >
                  前へ
                </button>
                <button
                  onClick={handleNext}
                  disabled={offset + customers.length >= total}
                  style={{
                    padding: '6px 14px',
                    border: '1px solid #d4d9df',
                    borderRadius: 6,
                    background: offset + customers.length >= total ? '#f3f4f6' : 'white',
                    color: offset + customers.length >= total ? '#bbb' : '#333',
                    cursor: offset + customers.length >= total ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit',
                    fontSize: '0.85rem',
                  }}
                >
                  次へ
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Form Modal (New/Edit) */}
      {formOpen && (
        <CustomerFormModal
          editingCustomer={editingCustomer}
          formData={formData}
          formSubmitting={formSubmitting}
          duplicateWarning={duplicateWarning}
          onChange={(field, value) => setFormData(prev => ({ ...prev, [field]: value }))}
          onPhoneBlur={handlePhoneBlur}
          onSubmit={handleFormSubmit}
          onClose={handleCloseForm}
        />
      )}
    </div>
  );
}

// ── Reservation History Component ───────────────────────────

function CustomerReservationHistory({ storeId, customerId }: { storeId: string; customerId: string }) {
  const [reservations, setReservations] = useState<ReservationRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await api.getCustomerReservations(storeId, customerId);
        if (!cancelled) setReservations(r.reservations);
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [storeId, customerId]);

  const statusColor = (s: string) => {
    switch (s) {
      case 'cancelled': return { bg: '#fee2e2', fg: '#dc2626' };
      case 'completed': return { bg: '#dcfce7', fg: '#16a34a' };
      case 'no_show': return { bg: '#fef3c7', fg: '#92400e' };
      default: return { bg: '#dbeafe', fg: '#1e40af' };
    }
  };

  const typeLabel = (t: string) => {
    switch (t) {
      case 'table': return 'テーブル';
      case 'school': return 'スクール';
      case 'timeslot': return '時間帯';
      case 'event': return 'イベント';
      default: return t;
    }
  };

  return (
    <div className="records-section" style={{ marginTop: 16 }}>
      <h3 style={{ marginBottom: 8 }}>予約履歴</h3>
      {loading ? (
        <p style={{ color: '#666', fontSize: '0.875rem' }}>読み込み中...</p>
      ) : reservations.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📅</div>
          <p className="empty-state-text">予約履歴がありません</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          {reservations.map((r) => {
            const sc = statusColor(r.status);
            return (
              <div key={r.id} style={{ padding: '10px 12px', background: '#fafafa', borderRadius: 8, border: '1px solid #f0f0f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>
                      {new Date(r.starts_at).toLocaleDateString('ja-JP')}
                    </span>
                    <span style={{ fontSize: 12, color: '#666', marginLeft: 8 }}>
                      {typeLabel(r.reservation_type)} / {r.party_size}名
                    </span>
                  </div>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: sc.bg, color: sc.fg }}>
                    {r.status}
                  </span>
                </div>
                {(r.metadata as { school_name?: string })?.school_name && (
                  <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                    {(r.metadata as { school_name?: string }).school_name}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Form Modal Component ─────────────────────────────────────

interface CustomerFormModalProps {
  editingCustomer: Customer | null;
  formData: FormData;
  formSubmitting: boolean;
  duplicateWarning: string | null;
  onChange: (field: keyof FormData, value: string) => void;
  onPhoneBlur: () => void;
  onSubmit: () => void;
  onClose: () => void;
}

function CustomerFormModal({
  editingCustomer,
  formData,
  formSubmitting,
  duplicateWarning,
  onChange,
  onPhoneBlur,
  onSubmit,
  onClose,
}: CustomerFormModalProps) {
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid #d4d9df',
    borderRadius: 6,
    fontFamily: 'inherit',
    fontSize: '0.9rem',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.8rem',
    color: '#666',
    marginBottom: 4,
    fontWeight: 500,
  };

  return (
    <div
      className="modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 16,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'white',
        borderRadius: 12,
        padding: 24,
        width: '100%',
        maxWidth: 480,
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>
            {editingCustomer ? '顧客情報の編集' : '新規顧客登録'}
          </h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: '#888', padding: '4px 8px' }}
          >
            ×
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* 名前 */}
          <div>
            <label style={labelStyle}>名前 <span style={{ color: '#dc2626' }}>*</span></label>
            <input
              type="text"
              value={formData.name}
              onChange={e => onChange('name', e.target.value)}
              placeholder="山田 太郎"
              style={inputStyle}
            />
          </div>

          {/* ふりがな */}
          <div>
            <label style={labelStyle}>ふりがな</label>
            <input
              type="text"
              value={formData.name_kana}
              onChange={e => onChange('name_kana', e.target.value)}
              placeholder="やまだ たろう"
              style={inputStyle}
            />
          </div>

          {/* 電話番号 */}
          <div>
            <label style={labelStyle}>電話番号</label>
            <input
              type="tel"
              value={formData.phone}
              onChange={e => onChange('phone', e.target.value)}
              onBlur={onPhoneBlur}
              placeholder="090-1234-5678"
              style={inputStyle}
            />
            {duplicateWarning && (
              <div style={{ marginTop: 4, padding: '6px 10px', background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 4, fontSize: '0.8rem', color: '#92400e' }}>
                ⚠ {duplicateWarning}
              </div>
            )}
          </div>

          {/* メール */}
          <div>
            <label style={labelStyle}>メール</label>
            <input
              type="email"
              value={formData.email}
              onChange={e => onChange('email', e.target.value)}
              placeholder="example@email.com"
              style={inputStyle}
            />
          </div>

          {/* 誕生日 */}
          <div>
            <label style={labelStyle}>誕生日</label>
            <input
              type="date"
              value={formData.birthday}
              onChange={e => onChange('birthday', e.target.value)}
              style={inputStyle}
            />
          </div>

          {/* タグ */}
          <div>
            <label style={labelStyle}>タグ（カンマ区切り）</label>
            <input
              type="text"
              value={formData.tags}
              onChange={e => onChange('tags', e.target.value)}
              placeholder="VIP, リピーター, アレルギー"
              style={inputStyle}
            />
          </div>

          {/* メモ */}
          <div>
            <label style={labelStyle}>メモ</label>
            <textarea
              value={formData.note}
              onChange={e => onChange('note', e.target.value)}
              placeholder="特記事項、アレルギー情報など"
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 20px',
              border: '1px solid #d4d9df',
              borderRadius: 6,
              background: 'white',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: '0.9rem',
            }}
          >
            キャンセル
          </button>
          <button
            onClick={onSubmit}
            disabled={formSubmitting || !formData.name.trim()}
            style={{
              padding: '8px 20px',
              background: formSubmitting || !formData.name.trim() ? '#93c5fd' : '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              cursor: formSubmitting || !formData.name.trim() ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              fontSize: '0.9rem',
              fontWeight: 500,
            }}
          >
            {formSubmitting ? '保存中...' : editingCustomer ? '更新する' : '登録する'}
          </button>
        </div>
      </div>
    </div>
  );
}
