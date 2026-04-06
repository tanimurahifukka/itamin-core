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
    const body = await res.json().catch(() => ({ error: 'Request failed' }));
    const err: any = new Error(body.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }

  return res.json();
}

export const api = {
  // Stores
  getStores: () => request<any>('/stores'),
  createStore: (name: string, address?: string) =>
    request<any>('/stores', { method: 'POST', body: JSON.stringify({ name, address }) }),
  getStoreAccount: (storeId: string) => request<any>(`/stores/${storeId}/account`),
  updateStoreAccount: (
    storeId: string,
    updates: { name: string; address?: string; phone?: string; openTime?: string; closeTime?: string }
  ) => request<any>(`/stores/${storeId}/account`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  }),
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
  updateStaff: (storeId: string, staffId: string, updates: { hourlyWage?: number; transportFee?: number; joinedAt?: string | null; role?: string }) =>
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
  correctAndClockIn: (storeId: string, staleRecordId: string, clockOut: string, breakMinutes?: number) =>
    request<any>(`/timecard/${storeId}/correct-and-clockin`, {
      method: 'POST',
      body: JSON.stringify({ staleRecordId, clockOut, breakMinutes }),
    }),
  clockOut: (storeId: string, breakMinutes?: number) =>
    request<any>(`/timecard/${storeId}/clock-out`, {
      method: 'POST',
      body: JSON.stringify({ breakMinutes }),
    }),
  updateTimeRecord: (storeId: string, recordId: string, updates: { clockIn?: string; clockOut?: string; breakMinutes?: number }) =>
    request<any>(`/timecard/${storeId}/records/${recordId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
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
  getWeeklyShifts: (storeId: string, date: string, days?: number) =>
    request<any>(`/shift/${storeId}/weekly?date=${date}${days ? `&days=${days}` : ''}`),
  saveShift: (storeId: string, shift: { staffId: string; date: string; startTime: string; endTime: string; status?: string }) =>
    request<any>(`/shift/${storeId}`, { method: 'POST', body: JSON.stringify(shift) }),
  publishShifts: (storeId: string, startDate: string, endDate: string) =>
    request<any>(`/shift/${storeId}/publish`, { method: 'POST', body: JSON.stringify({ startDate, endDate }) }),
  deleteShift: (storeId: string, shiftId: string) =>
    request<any>(`/shift/${storeId}/${shiftId}`, { method: 'DELETE' }),

  // Shift Requests
  getWeeklyRequests: (storeId: string, date: string, days?: number) =>
    request<any>(`/shift/${storeId}/requests?date=${date}${days ? `&days=${days}` : ''}`),
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
  saveDailyReport: (storeId: string, data: { date: string; sales: number; customerCount: number; weather: string; memo: string; items?: { menuItemId: string; quantity: number }[] }) =>
    request<any>(`/daily-report/${storeId}/reports`, { method: 'POST', body: JSON.stringify(data) }),

  // Menu
  getMenuItems: (storeId: string, active?: boolean) => {
    const params = active !== undefined ? `?active=${active}` : '';
    return request<any>(`/menu/${storeId}/items${params}`);
  },
  createMenuItem: (storeId: string, data: { name: string; category?: string; price: number; display_order?: number }) =>
    request<any>(`/menu/${storeId}/items`, { method: 'POST', body: JSON.stringify(data) }),
  updateMenuItem: (storeId: string, itemId: string, updates: Record<string, any>) =>
    request<any>(`/menu/${storeId}/items/${itemId}`, { method: 'PUT', body: JSON.stringify(updates) }),
  deleteMenuItem: (storeId: string, itemId: string) =>
    request<any>(`/menu/${storeId}/items/${itemId}`, { method: 'DELETE' }),

  // Notice
  getNotices: (storeId: string) =>
    request<any>(`/notice/${storeId}/posts`),
  postNotice: (storeId: string, data: { title: string; body: string }) =>
    request<any>(`/notice/${storeId}/posts`, { method: 'POST', body: JSON.stringify(data) }),
  markNoticeRead: (storeId: string, noticeId: string) =>
    request<any>(`/notice/${storeId}/posts/${noticeId}/read`, { method: 'POST' }),
  toggleNoticePin: (storeId: string, noticeId: string, pinned: boolean) =>
    request<any>(`/notice/${storeId}/posts/${noticeId}/pin`, { method: 'PUT', body: JSON.stringify({ pinned }) }),
  updateNoticeImages: (storeId: string, noticeId: string, imageUrls: string[]) =>
    request<any>(`/notice/${storeId}/posts/${noticeId}/images`, { method: 'PATCH', body: JSON.stringify({ imageUrls }) }),
  editNotice: (storeId: string, noticeId: string, data: { title?: string; body?: string }) =>
    request<any>(`/notice/${storeId}/posts/${noticeId}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteNotice: (storeId: string, noticeId: string) =>
    request<any>(`/notice/${storeId}/posts/${noticeId}`, { method: 'DELETE' }),
  getNoticeComments: (storeId: string, noticeId: string) =>
    request<any>(`/notice/${storeId}/posts/${noticeId}/comments`),
  postNoticeComment: (storeId: string, noticeId: string, body: string) =>
    request<any>(`/notice/${storeId}/posts/${noticeId}/comments`, { method: 'POST', body: JSON.stringify({ body }) }),
  deleteNoticeComment: (storeId: string, noticeId: string, commentId: string) =>
    request<any>(`/notice/${storeId}/posts/${noticeId}/comments/${commentId}`, { method: 'DELETE' }),

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

  // Sales Capture
  getSalesReceipts: (storeId: string, date?: string) => {
    const params = date ? `?date=${date}` : '';
    return request<any>(`/sales-capture/${storeId}/receipts${params}`);
  },
  getUploadUrl: (storeId: string, fileName: string, contentType?: string) =>
    request<any>(`/sales-capture/${storeId}/upload-url`, {
      method: 'POST',
      body: JSON.stringify({ fileName, contentType }),
    }),
  createSalesReceipt: (storeId: string, data: { businessDate: string; filePath: string; fileName: string; sourceType?: string }) =>
    request<any>(`/sales-capture/${storeId}/receipts`, { method: 'POST', body: JSON.stringify(data) }),
  getSalesClose: (storeId: string, date: string) =>
    request<any>(`/sales-capture/${storeId}/closes/${date}`),
  saveSalesClose: (storeId: string, data: Record<string, any>) =>
    request<any>(`/sales-capture/${storeId}/closes`, { method: 'POST', body: JSON.stringify(data) }),
  approveSalesClose: (storeId: string, date: string) =>
    request<any>(`/sales-capture/${storeId}/closes/${date}/approve`, { method: 'POST' }),
  getCashClose: (storeId: string, date: string) =>
    request<any>(`/sales-capture/${storeId}/cash-close/${date}`),
  saveCashClose: (storeId: string, data: { businessDate: string; expectedCash: number; countedCash: number; note?: string }) =>
    request<any>(`/sales-capture/${storeId}/cash-close`, { method: 'POST', body: JSON.stringify(data) }),

  // ========== Attendance (LINE打刻) ==========
  getAttendanceToday: (storeId: string) =>
    request<any>(`/attendance/me/today?storeId=${storeId}`),
  attendanceClockIn: (storeId: string, source?: string, idempotencyKey?: string) =>
    request<any>('/attendance/clock-in', { method: 'POST', body: JSON.stringify({ storeId, source, idempotencyKey }) }),
  attendanceBreakStart: (storeId: string, reason?: string, idempotencyKey?: string) =>
    request<any>('/attendance/break-start', { method: 'POST', body: JSON.stringify({ storeId, reason, idempotencyKey }) }),
  attendanceBreakEnd: (storeId: string, idempotencyKey?: string) =>
    request<any>('/attendance/break-end', { method: 'POST', body: JSON.stringify({ storeId, idempotencyKey }) }),
  attendanceClockOut: (storeId: string, idempotencyKey?: string) =>
    request<any>('/attendance/clock-out', { method: 'POST', body: JSON.stringify({ storeId, idempotencyKey }) }),
  getAttendanceHistory: (storeId: string, month?: string) =>
    request<any>(`/attendance/me/history?storeId=${storeId}${month ? `&month=${month}` : ''}`),
  createCorrection: (storeId: string, data: any) =>
    request<any>('/attendance/corrections', { method: 'POST', body: JSON.stringify({ storeId, ...data }) }),
  getMyCorrections: (storeId: string) =>
    request<any>(`/attendance/corrections/me?storeId=${storeId}`),

  // Admin Attendance
  getAdminAttendanceToday: (storeId: string, status?: string, q?: string) => {
    const params = new URLSearchParams({ storeId });
    if (status) params.set('status', status);
    if (q) params.set('q', q);
    return request<any>(`/attendance/admin/today?${params}`);
  },
  getAdminAttendanceMonthly: (storeId: string, month?: string) =>
    request<any>(`/attendance/admin/monthly?storeId=${storeId}${month ? `&month=${month}` : ''}`),
  getAdminStaffAttendance: (storeId: string, userId: string, month?: string) =>
    request<any>(`/attendance/admin/staff/${userId}?storeId=${storeId}${month ? `&month=${month}` : ''}`),
  adminUpdateRecord: (storeId: string, recordId: string, data: any) =>
    request<any>(`/attendance/admin/records/${recordId}`, { method: 'PATCH', body: JSON.stringify({ storeId, ...data }) }),
  getAdminCorrections: (storeId: string) =>
    request<any>(`/attendance/admin/corrections?storeId=${storeId}`),
  approveCorrection: (storeId: string, correctionId: string, comment?: string) =>
    request<any>(`/attendance/admin/corrections/${correctionId}/approve`, { method: 'POST', body: JSON.stringify({ storeId, comment }) }),
  rejectCorrection: (storeId: string, correctionId: string, comment?: string) =>
    request<any>(`/attendance/admin/corrections/${correctionId}/reject`, { method: 'POST', body: JSON.stringify({ storeId, comment }) }),
  getAttendancePolicy: (storeId: string) =>
    request<any>(`/attendance/admin/policy?storeId=${storeId}`),
  updateAttendancePolicy: (storeId: string, data: any) =>
    request<any>('/attendance/admin/policy', { method: 'PUT', body: JSON.stringify({ storeId, ...data }) }),

  // LINE
  getLineLoginUrl: (storeId: string) => request<any>(`/auth/line/login?storeId=${storeId}`),
  lineCallback: (storeId: string, code: string, state?: string) =>
    request<any>('/auth/line/callback', { method: 'POST', body: JSON.stringify({ storeId, code, state }) }),
  lineLinkWithCode: (code: string, lineUserId: string, displayName?: string, pictureUrl?: string) =>
    request<any>('/auth/line/link-with-code', { method: 'POST', body: JSON.stringify({ code, lineUserId, displayName, pictureUrl }) }),
  lineResolve: (lineUserId: string) =>
    request<any>('/auth/line/resolve', { method: 'POST', body: JSON.stringify({ lineUserId }) }),
  getLineMe: () => request<any>('/auth/line/me'),
  adminIssueLinkToken: (storeId: string, userId: string) =>
    request<any>('/auth/line/admin/link-tokens', { method: 'POST', body: JSON.stringify({ storeId, userId }) }),
  adminGetLineLinks: (storeId: string) =>
    request<any>(`/auth/line/admin/links?storeId=${storeId}`),
};
