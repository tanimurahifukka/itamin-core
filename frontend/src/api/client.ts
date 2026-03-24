import { supabase } from './supabase';

const API_BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  // Supabase Auth のアクセストークンをヘッダーに付与
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${res.status}`);
  }

  return res.json();
}

export const api = {
  // Stores
  getStores: () => request<any>('/stores'),
  createStore: (name: string, address?: string) =>
    request<any>('/stores', { method: 'POST', body: JSON.stringify({ name, address }) }),
  getStoreStaff: (storeId: string) => request<any>(`/stores/${storeId}/staff`),
  addStaff: (storeId: string, name: string, email: string, role?: string, hourlyWage?: number) =>
    request<any>(`/stores/${storeId}/staff`, {
      method: 'POST',
      body: JSON.stringify({ name, email, role, hourlyWage }),
    }),
  getInitialPassword: (storeId: string) => request<any>(`/stores/${storeId}/initial-password`),
  setInitialPassword: (storeId: string, password: string) =>
    request<any>(`/stores/${storeId}/initial-password`, {
      method: 'PUT',
      body: JSON.stringify({ password }),
    }),
  updateStaff: (storeId: string, staffId: string, updates: { hourlyWage?: number; role?: string }) =>
    request<any>(`/stores/${storeId}/staff/${staffId}`, { method: 'PUT', body: JSON.stringify(updates) }),
  removeStaff: (storeId: string, staffId: string) =>
    request<any>(`/stores/${storeId}/staff/${staffId}`, { method: 'DELETE' }),
  getStoreInvitations: (storeId: string) => request<any>(`/stores/${storeId}/invitations`),
  resendInvitation: (storeId: string, invitationId: string) =>
    request<any>(`/stores/${storeId}/invitations/${invitationId}/resend`, {
      method: 'POST',
    }),
  cancelInvitation: (storeId: string, invitationId: string) =>
    request<any>(`/stores/${storeId}/invitations/${invitationId}`, {
      method: 'DELETE',
    }),

  rehireStaff: (storeId: string, data: { email: string; role?: string; hourlyWage?: number }) =>
    request<any>(`/stores/${storeId}/staff/rehire`, { method: 'POST', body: JSON.stringify(data) }),

  // Timecard
  getTimecardStatus: (storeId: string) => request<any>(`/timecard/${storeId}/status`),
  clockIn: (storeId: string) =>
    request<any>(`/timecard/${storeId}/clock-in`, { method: 'POST' }),
  clockOut: (storeId: string, breakMinutes?: number) =>
    request<any>(`/timecard/${storeId}/clock-out`, {
      method: 'POST',
      body: JSON.stringify({ breakMinutes }),
    }),
  getDailyRecords: (storeId: string, date?: string) =>
    request<any>(`/timecard/${storeId}/daily${date ? `?date=${date}` : ''}`),
  getMonthlyRecords: (storeId: string, year?: number, month?: number) => {
    const params = new URLSearchParams();
    if (year) params.set('year', String(year));
    if (month !== undefined) params.set('month', String(month));
    return request<any>(`/timecard/${storeId}/monthly?${params}`);
  },

  // Plugin Settings
  getPluginSettings: (storeId: string) => request<any>(`/plugin-settings/${storeId}`),
  togglePlugin: (storeId: string, pluginName: string, enabled: boolean) =>
    request<any>(`/plugin-settings/${storeId}/${pluginName}`, {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    }),
  updatePluginConfig: (storeId: string, pluginName: string, config: Record<string, any>) =>
    request<any>(`/plugin-settings/${storeId}/${pluginName}/config`, {
      method: 'PUT',
      body: JSON.stringify({ config }),
    }),
  updatePluginPermissions: (storeId: string, pluginName: string, roles: string[]) =>
    request<any>(`/plugin-settings/${storeId}/${pluginName}/permissions`, {
      method: 'PUT',
      body: JSON.stringify({ roles }),
    }),

  // Shift
  getWeeklyShifts: (storeId: string, date: string) =>
    request<any>(`/shift/${storeId}/weekly?date=${date}`),
  saveShift: (storeId: string, shift: { staffId: string; date: string; startTime: string; endTime: string; status?: string }) =>
    request<any>(`/shift/${storeId}`, { method: 'POST', body: JSON.stringify(shift) }),
  publishShifts: (storeId: string, startDate: string, endDate: string) =>
    request<any>(`/shift/${storeId}/publish`, { method: 'POST', body: JSON.stringify({ startDate, endDate }) }),
  deleteShift: (storeId: string, shiftId: string) =>
    request<any>(`/shift/${storeId}/${shiftId}`, { method: 'DELETE' }),

  // Shift Requests
  getWeeklyRequests: (storeId: string, date: string) =>
    request<any>(`/shift/${storeId}/requests?date=${date}`),
  saveRequest: (storeId: string, data: { staffId: string; date: string; requestType: string; startTime?: string; endTime?: string; note?: string }) =>
    request<any>(`/shift/${storeId}/requests`, { method: 'POST', body: JSON.stringify(data) }),
  deleteRequest: (storeId: string, requestId: string) =>
    request<any>(`/shift/${storeId}/requests/${requestId}`, { method: 'DELETE' }),

  // Shift Templates
  getTemplates: (storeId: string) =>
    request<any>(`/shift/${storeId}/templates`),
  saveTemplate: (storeId: string, data: { name: string; startTime: string; endTime: string; breakMinutes?: number; color?: string }) =>
    request<any>(`/shift/${storeId}/templates`, { method: 'POST', body: JSON.stringify(data) }),
  deleteTemplate: (storeId: string, templateId: string) =>
    request<any>(`/shift/${storeId}/templates/${templateId}`, { method: 'DELETE' }),

  // Inventory
  getInventory: (storeId: string, category?: string) => {
    const params = category ? `?category=${encodeURIComponent(category)}` : '';
    return request<any>(`/inventory/${storeId}/items${params}`);
  },
  addInventoryItem: (storeId: string, item: { name: string; category?: string; unit?: string; quantity?: number; minQuantity?: number; cost?: number; note?: string }) =>
    request<any>(`/inventory/${storeId}/items`, { method: 'POST', body: JSON.stringify(item) }),
  updateInventoryItem: (storeId: string, itemId: string, updates: Record<string, any>) =>
    request<any>(`/inventory/${storeId}/items/${itemId}`, { method: 'PUT', body: JSON.stringify(updates) }),
  deleteInventoryItem: (storeId: string, itemId: string) =>
    request<any>(`/inventory/${storeId}/items/${itemId}`, { method: 'DELETE' }),

  // Overtime Alert
  getOvertimeAlert: (storeId: string, year?: number, month?: number) => {
    const params = new URLSearchParams();
    if (year) params.set('year', String(year));
    if (month) params.set('month', String(month));
    return request<any>(`/overtime-alert/${storeId}/monthly?${params}`);
  },

  // Consecutive Work
  getConsecutiveWork: (storeId: string) =>
    request<any>(`/consecutive-work/${storeId}/status`),

  // Daily Report
  getDailyReports: (storeId: string, year?: number, month?: number) => {
    const params = new URLSearchParams();
    if (year) params.set('year', String(year));
    if (month) params.set('month', String(month));
    return request<any>(`/daily-report/${storeId}/reports?${params}`);
  },
  getDailyReport: (storeId: string, date: string) =>
    request<any>(`/daily-report/${storeId}/reports/${date}`),
  saveDailyReport: (storeId: string, data: { date: string; sales: number; customerCount: number; weather: string; memo: string }) =>
    request<any>(`/daily-report/${storeId}/reports`, { method: 'POST', body: JSON.stringify(data) }),

  // Notice
  getNotices: (storeId: string) =>
    request<any>(`/notice/${storeId}/posts`),
  postNotice: (storeId: string, data: { title: string; body: string }) =>
    request<any>(`/notice/${storeId}/posts`, { method: 'POST', body: JSON.stringify(data) }),
  markNoticeRead: (storeId: string, noticeId: string) =>
    request<any>(`/notice/${storeId}/posts/${noticeId}/read`, { method: 'POST' }),
  toggleNoticePin: (storeId: string, noticeId: string, pinned: boolean) =>
    request<any>(`/notice/${storeId}/posts/${noticeId}/pin`, { method: 'PUT', body: JSON.stringify({ pinned }) }),
  deleteNotice: (storeId: string, noticeId: string) =>
    request<any>(`/notice/${storeId}/posts/${noticeId}`, { method: 'DELETE' }),

  // Paid Leave
  getPaidLeaveSummary: (storeId: string, fiscalYear?: number) => {
    const params = fiscalYear ? `?fiscalYear=${fiscalYear}` : '';
    return request<any>(`/paid-leave/${storeId}/summary${params}`);
  },
  grantPaidLeave: (storeId: string, data: { staffId: string; totalDays: number; fiscalYear?: number }) =>
    request<any>(`/paid-leave/${storeId}/grant`, { method: 'POST', body: JSON.stringify(data) }),
  getLeaveRecords: (storeId: string, staffId?: string) => {
    const params = staffId ? `?staffId=${staffId}` : '';
    return request<any>(`/paid-leave/${storeId}/records${params}`);
  },
  addLeaveRecord: (storeId: string, data: { staffId: string; date: string; type: string; note: string }) =>
    request<any>(`/paid-leave/${storeId}/records`, { method: 'POST', body: JSON.stringify(data) }),
  deleteLeaveRecord: (storeId: string, recordId: string) =>
    request<any>(`/paid-leave/${storeId}/records/${recordId}`, { method: 'DELETE' }),

  // Expense
  getExpenses: (storeId: string, year?: number, month?: number, category?: string) => {
    const params = new URLSearchParams();
    if (year) params.set('year', String(year));
    if (month) params.set('month', String(month));
    if (category) params.set('category', category);
    return request<any>(`/expense/${storeId}/items?${params}`);
  },
  addExpense: (storeId: string, data: { date: string; category: string; description: string; amount: number; receiptNote?: string }) =>
    request<any>(`/expense/${storeId}/items`, { method: 'POST', body: JSON.stringify(data) }),
  updateExpense: (storeId: string, expenseId: string, updates: Record<string, any>) =>
    request<any>(`/expense/${storeId}/items/${expenseId}`, { method: 'PUT', body: JSON.stringify(updates) }),
  deleteExpense: (storeId: string, expenseId: string) =>
    request<any>(`/expense/${storeId}/items/${expenseId}`, { method: 'DELETE' }),

  // Feedback
  getFeedback: (storeId: string, status?: string, type?: string) => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (type) params.set('type', type);
    return request<any>(`/feedback/${storeId}/items?${params}`);
  },
  addFeedback: (storeId: string, data: { date: string; type: string; content: string; response?: string }) =>
    request<any>(`/feedback/${storeId}/items`, { method: 'POST', body: JSON.stringify(data) }),
  updateFeedback: (storeId: string, itemId: string, updates: Record<string, any>) =>
    request<any>(`/feedback/${storeId}/items/${itemId}`, { method: 'PUT', body: JSON.stringify(updates) }),
  deleteFeedback: (storeId: string, itemId: string) =>
    request<any>(`/feedback/${storeId}/items/${itemId}`, { method: 'DELETE' }),
};
