import { supabase } from './supabase';
import type {
  Store,
  StoreAccount,
  StaffMember,
  Invitation,
  TimeRecord,
  TimecardStatus,
  MonthlySummaryStaff,
  PluginInfo,
  Shift,
  ShiftRequest,
  ShiftTemplate,
  InventoryItem,
  DailyReport,
  DailyReportItem,
  Notice,
  NoticeComment,
  PaidLeaveSummary,
  LeaveRecord,
  Expense,
  ExpenseSummary,
  FeedbackItem,
  MenuItem,
  SalesReceipt,
  SalesClose,
  CashClose,
  UploadUrlResponse,
  StaffOvertimeInfo,
  StaffConsecutiveInfo,
  AttendanceTodayResponse,
  AttendanceActionResponse,
  AttendanceCorrection,
  AdminTodayStaff,
  AdminMonthlySummary,
  HaccpTemplate,
  HaccpItem,
  LineLoginUrlResponse,
  LineLink,
  KioskStaff,
  OkResponse,
} from '../types/api';

const API_BASE = '/api';

class ApiRequestError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.body = body;
  }
}

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
    throw new ApiRequestError(body.error || `HTTP ${res.status}`, res.status, body);
  }

  return res.json();
}

export const api = {
  // Stores
  getStores: () => request<{ stores: Store[] }>('/stores'),
  createStore: (name: string, address?: string) =>
    request<{ store: Store }>('/stores', { method: 'POST', body: JSON.stringify({ name, address }) }),
  getStoreAccount: (storeId: string) => request<{ account: StoreAccount }>(`/stores/${storeId}/account`),
  updateStoreAccount: (
    storeId: string,
    updates: { name: string; address?: string; phone?: string; openTime?: string; closeTime?: string }
  ) => request<{ account: StoreAccount }>(`/stores/${storeId}/account`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  }),
  getStoreStaff: (storeId: string) => request<{ staff: StaffMember[] }>(`/stores/${storeId}/staff`),
  addStaff: (storeId: string, name: string, email: string, role?: string, hourlyWage?: number) =>
    request<{ invited: boolean; invitation: Invitation; message?: string }>(`/stores/${storeId}/staff`, {
      method: 'POST',
      body: JSON.stringify({ name, email, role, hourlyWage }),
    }),
  getInitialPassword: (storeId: string) => request<{ initialPassword: string }>(`/stores/${storeId}/initial-password`),
  setInitialPassword: (storeId: string, password: string) =>
    request<OkResponse>(`/stores/${storeId}/initial-password`, {
      method: 'PUT',
      body: JSON.stringify({ password }),
    }),
  updateStaff: (storeId: string, staffId: string, updates: { hourlyWage?: number; transportFee?: number; joinedAt?: string | null; role?: string }) =>
    request<OkResponse>(`/stores/${storeId}/staff/${staffId}`, { method: 'PUT', body: JSON.stringify(updates) }),
  removeStaff: (storeId: string, staffId: string) =>
    request<OkResponse>(`/stores/${storeId}/staff/${staffId}`, { method: 'DELETE' }),
  getStoreInvitations: (storeId: string) => request<{ invitations: Invitation[] }>(`/stores/${storeId}/invitations`),
  resendInvitation: (storeId: string, invitationId: string) =>
    request<OkResponse>(`/stores/${storeId}/invitations/${invitationId}/resend`, {
      method: 'POST',
    }),
  cancelInvitation: (storeId: string, invitationId: string) =>
    request<OkResponse>(`/stores/${storeId}/invitations/${invitationId}`, {
      method: 'DELETE',
    }),

  rehireStaff: (storeId: string, data: { email: string; role?: string; hourlyWage?: number }) =>
    request<{ invitation: Invitation; message?: string }>(`/stores/${storeId}/staff/rehire`, { method: 'POST', body: JSON.stringify(data) }),

  // Timecard
  getTimecardStatus: (storeId: string) => request<TimecardStatus>(`/timecard/${storeId}/status`),
  clockIn: (storeId: string) =>
    request<{ record: TimeRecord }>(`/timecard/${storeId}/clock-in`, { method: 'POST' }),
  correctAndClockIn: (storeId: string, staleRecordId: string, clockOut: string, breakMinutes?: number) =>
    request<{ record: TimeRecord }>(`/timecard/${storeId}/correct-and-clockin`, {
      method: 'POST',
      body: JSON.stringify({ staleRecordId, clockOut, breakMinutes }),
    }),
  clockOut: (storeId: string, breakMinutes?: number) =>
    request<{ record: TimeRecord }>(`/timecard/${storeId}/clock-out`, {
      method: 'POST',
      body: JSON.stringify({ breakMinutes }),
    }),
  updateTimeRecord: (storeId: string, recordId: string, updates: { clockIn?: string; clockOut?: string; breakMinutes?: number }) =>
    request<{ record: TimeRecord }>(`/timecard/${storeId}/records/${recordId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),
  getDailyRecords: (storeId: string, date?: string) =>
    request<{ records: TimeRecord[] }>(`/timecard/${storeId}/daily${date ? `?date=${date}` : ''}`),
  getMonthlyRecords: (storeId: string, year?: number, month?: number) => {
    const params = new URLSearchParams();
    if (year) params.set('year', String(year));
    if (month !== undefined) params.set('month', String(month));
    return request<{ records: TimeRecord[]; summary: MonthlySummaryStaff[] }>(`/timecard/${storeId}/monthly?${params}`);
  },

  // Plugin Settings
  getPluginSettings: (storeId: string) => request<{ plugins: PluginInfo[] }>(`/plugin-settings/${storeId}`),
  togglePlugin: (storeId: string, pluginName: string, enabled: boolean) =>
    request<OkResponse>(`/plugin-settings/${storeId}/${pluginName}`, {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    }),
  updatePluginConfig: (storeId: string, pluginName: string, config: Record<string, unknown>) =>
    request<OkResponse>(`/plugin-settings/${storeId}/${pluginName}/config`, {
      method: 'PUT',
      body: JSON.stringify({ config }),
    }),
  updatePluginPermissions: (storeId: string, pluginName: string, roles: string[]) =>
    request<OkResponse>(`/plugin-settings/${storeId}/${pluginName}/permissions`, {
      method: 'PUT',
      body: JSON.stringify({ roles }),
    }),

  // SwitchBot
  getSwitchBotReadings: (storeId: string, deviceId?: string, limit?: number) => {
    const params = new URLSearchParams();
    if (deviceId) params.set('deviceId', deviceId);
    if (limit) params.set('limit', String(limit));
    return request<{ readings: Array<{ id: string; device_id: string; device_name: string; temperature: number | null; humidity: number | null; battery: number | null; recorded_at: string }> }>(
      `/switchbot/${storeId}/readings?${params}`
    );
  },
  getSwitchBotAdminDevices: (storeId: string) =>
    request<{ devices: Array<{ deviceId: string; deviceName: string; deviceType: string }> }>(`/switchbot/${storeId}/devices`),

  // Shift
  getWeeklyShifts: (storeId: string, date: string, days?: number) =>
    request<{ shifts: Shift[]; startDate: string; endDate: string }>(`/shift/${storeId}/weekly?date=${date}${days ? `&days=${days}` : ''}`),
  saveShift: (storeId: string, shift: { staffId: string; date: string; startTime: string; endTime: string; status?: string }) =>
    request<{ shift: Shift }>(`/shift/${storeId}`, { method: 'POST', body: JSON.stringify(shift) }),
  publishShifts: (storeId: string, startDate: string, endDate: string) =>
    request<{ published: number }>(`/shift/${storeId}/publish`, { method: 'POST', body: JSON.stringify({ startDate, endDate }) }),
  deleteShift: (storeId: string, shiftId: string) =>
    request<OkResponse>(`/shift/${storeId}/${shiftId}`, { method: 'DELETE' }),

  // Shift Requests
  getWeeklyRequests: (storeId: string, date: string, days?: number) =>
    request<{ requests: ShiftRequest[] }>(`/shift/${storeId}/requests?date=${date}${days ? `&days=${days}` : ''}`),
  saveRequest: (storeId: string, data: { staffId: string; date: string; requestType: string; startTime?: string; endTime?: string; note?: string }) =>
    request<{ request: ShiftRequest }>(`/shift/${storeId}/requests`, { method: 'POST', body: JSON.stringify(data) }),
  deleteRequest: (storeId: string, requestId: string) =>
    request<OkResponse>(`/shift/${storeId}/requests/${requestId}`, { method: 'DELETE' }),

  // Shift Templates
  getTemplates: (storeId: string) =>
    request<{ templates: ShiftTemplate[] }>(`/shift/${storeId}/templates`),
  saveTemplate: (storeId: string, data: { name: string; startTime: string; endTime: string; breakMinutes?: number; color?: string }) =>
    request<{ template: ShiftTemplate }>(`/shift/${storeId}/templates`, { method: 'POST', body: JSON.stringify(data) }),
  deleteTemplate: (storeId: string, templateId: string) =>
    request<OkResponse>(`/shift/${storeId}/templates/${templateId}`, { method: 'DELETE' }),

  // Inventory
  getInventory: (storeId: string, category?: string) => {
    const params = category ? `?category=${encodeURIComponent(category)}` : '';
    return request<{ items: InventoryItem[] }>(`/inventory/${storeId}/items${params}`);
  },
  addInventoryItem: (storeId: string, item: { name: string; category?: string; unit?: string; quantity?: number; minQuantity?: number; cost?: number; note?: string }) =>
    request<{ item: InventoryItem }>(`/inventory/${storeId}/items`, { method: 'POST', body: JSON.stringify(item) }),
  updateInventoryItem: (storeId: string, itemId: string, updates: Partial<Pick<InventoryItem, 'name' | 'category' | 'unit' | 'quantity' | 'minQuantity' | 'cost' | 'note' | 'status'>>) =>
    request<{ item: InventoryItem }>(`/inventory/${storeId}/items/${itemId}`, { method: 'PUT', body: JSON.stringify(updates) }),
  deleteInventoryItem: (storeId: string, itemId: string) =>
    request<OkResponse>(`/inventory/${storeId}/items/${itemId}`, { method: 'DELETE' }),

  // Overtime Alert
  getOvertimeAlert: (storeId: string, year?: number, month?: number) => {
    const params = new URLSearchParams();
    if (year) params.set('year', String(year));
    if (month) params.set('month', String(month));
    return request<{ staff: StaffOvertimeInfo[] }>(`/overtime-alert/${storeId}/monthly?${params}`);
  },

  // Consecutive Work
  getConsecutiveWork: (storeId: string) =>
    request<{ staff: StaffConsecutiveInfo[] }>(`/consecutive-work/${storeId}/status`),

  // Daily Report
  getDailyReports: (storeId: string, year?: number, month?: number) => {
    const params = new URLSearchParams();
    if (year) params.set('year', String(year));
    if (month) params.set('month', String(month));
    return request<{ reports: DailyReport[] }>(`/daily-report/${storeId}/reports?${params}`);
  },
  getDailyReport: (storeId: string, date: string) =>
    request<{ report: DailyReport; items: DailyReportItem[] }>(`/daily-report/${storeId}/reports/${date}`),
  saveDailyReport: (storeId: string, data: { date: string; sales: number; customerCount: number; weather: string; memo: string; items?: { menuItemId: string; quantity: number }[] }) =>
    request<{ report: DailyReport }>(`/daily-report/${storeId}/reports`, { method: 'POST', body: JSON.stringify(data) }),

  // Menu
  getMenuItems: (storeId: string, active?: boolean) => {
    const params = active !== undefined ? `?active=${active}` : '';
    return request<{ items: MenuItem[] }>(`/menu/${storeId}/items${params}`);
  },
  createMenuItem: (storeId: string, data: { name: string; category?: string; price: number; display_order?: number }) =>
    request<{ item: MenuItem }>(`/menu/${storeId}/items`, { method: 'POST', body: JSON.stringify(data) }),
  updateMenuItem: (storeId: string, itemId: string, updates: Partial<Pick<MenuItem, 'name' | 'category' | 'price' | 'displayOrder' | 'isActive'>> & { is_active?: boolean }) =>
    request<{ item: MenuItem }>(`/menu/${storeId}/items/${itemId}`, { method: 'PUT', body: JSON.stringify(updates) }),
  deleteMenuItem: (storeId: string, itemId: string) =>
    request<OkResponse>(`/menu/${storeId}/items/${itemId}`, { method: 'DELETE' }),

  // Notice
  getNotices: (storeId: string) =>
    request<{ notices: Notice[] }>(`/notice/${storeId}/posts`),
  postNotice: (storeId: string, data: { title: string; body: string }) =>
    request<{ notice: Notice }>(`/notice/${storeId}/posts`, { method: 'POST', body: JSON.stringify(data) }),
  markNoticeRead: (storeId: string, noticeId: string) =>
    request<OkResponse>(`/notice/${storeId}/posts/${noticeId}/read`, { method: 'POST' }),
  toggleNoticePin: (storeId: string, noticeId: string, pinned: boolean) =>
    request<OkResponse>(`/notice/${storeId}/posts/${noticeId}/pin`, { method: 'PUT', body: JSON.stringify({ pinned }) }),
  updateNoticeImages: (storeId: string, noticeId: string, imageUrls: string[]) =>
    request<OkResponse>(`/notice/${storeId}/posts/${noticeId}/images`, { method: 'PATCH', body: JSON.stringify({ imageUrls }) }),
  editNotice: (storeId: string, noticeId: string, data: { title?: string; body?: string }) =>
    request<{ notice: Notice }>(`/notice/${storeId}/posts/${noticeId}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteNotice: (storeId: string, noticeId: string) =>
    request<OkResponse>(`/notice/${storeId}/posts/${noticeId}`, { method: 'DELETE' }),
  getNoticeComments: (storeId: string, noticeId: string) =>
    request<{ comments: NoticeComment[] }>(`/notice/${storeId}/posts/${noticeId}/comments`),
  postNoticeComment: (storeId: string, noticeId: string, body: string) =>
    request<{ comment: NoticeComment }>(`/notice/${storeId}/posts/${noticeId}/comments`, { method: 'POST', body: JSON.stringify({ body }) }),
  deleteNoticeComment: (storeId: string, noticeId: string, commentId: string) =>
    request<OkResponse>(`/notice/${storeId}/posts/${noticeId}/comments/${commentId}`, { method: 'DELETE' }),

  // Paid Leave
  getPaidLeaveSummary: (storeId: string, fiscalYear?: number) => {
    const params = fiscalYear ? `?fiscalYear=${fiscalYear}` : '';
    return request<{ summary: PaidLeaveSummary[] }>(`/paid-leave/${storeId}/summary${params}`);
  },
  grantPaidLeave: (storeId: string, data: { staffId: string; totalDays: number; fiscalYear?: number }) =>
    request<OkResponse>(`/paid-leave/${storeId}/grant`, { method: 'POST', body: JSON.stringify(data) }),
  getLeaveRecords: (storeId: string, staffId?: string) => {
    const params = staffId ? `?staffId=${staffId}` : '';
    return request<{ records: LeaveRecord[] }>(`/paid-leave/${storeId}/records${params}`);
  },
  addLeaveRecord: (storeId: string, data: { staffId: string; date: string; type: string; note: string }) =>
    request<{ record: LeaveRecord }>(`/paid-leave/${storeId}/records`, { method: 'POST', body: JSON.stringify(data) }),
  deleteLeaveRecord: (storeId: string, recordId: string) =>
    request<OkResponse>(`/paid-leave/${storeId}/records/${recordId}`, { method: 'DELETE' }),

  // Expense
  getExpenses: (storeId: string, year?: number, month?: number, category?: string) => {
    const params = new URLSearchParams();
    if (year) params.set('year', String(year));
    if (month) params.set('month', String(month));
    if (category) params.set('category', category);
    return request<{ items: Expense[]; summary: ExpenseSummary }>(`/expense/${storeId}/items?${params}`);
  },
  addExpense: (storeId: string, data: { date: string; category: string; description: string; amount: number; receiptNote?: string }) =>
    request<{ item: Expense }>(`/expense/${storeId}/items`, { method: 'POST', body: JSON.stringify(data) }),
  updateExpense: (storeId: string, expenseId: string, updates: Partial<Pick<Expense, 'date' | 'category' | 'description' | 'amount' | 'receiptNote'>>) =>
    request<{ item: Expense }>(`/expense/${storeId}/items/${expenseId}`, { method: 'PUT', body: JSON.stringify(updates) }),
  deleteExpense: (storeId: string, expenseId: string) =>
    request<OkResponse>(`/expense/${storeId}/items/${expenseId}`, { method: 'DELETE' }),

  // Feedback
  getFeedback: (storeId: string, status?: string, type?: string) => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (type) params.set('type', type);
    return request<{ items: FeedbackItem[] }>(`/feedback/${storeId}/items?${params}`);
  },
  addFeedback: (storeId: string, data: { date: string; type: string; content: string; response?: string }) =>
    request<{ item: FeedbackItem }>(`/feedback/${storeId}/items`, { method: 'POST', body: JSON.stringify(data) }),
  updateFeedback: (storeId: string, itemId: string, updates: Partial<Pick<FeedbackItem, 'date' | 'type' | 'content' | 'response' | 'status'>>) =>
    request<{ item: FeedbackItem }>(`/feedback/${storeId}/items/${itemId}`, { method: 'PUT', body: JSON.stringify(updates) }),
  deleteFeedback: (storeId: string, itemId: string) =>
    request<OkResponse>(`/feedback/${storeId}/items/${itemId}`, { method: 'DELETE' }),

  // Sales Capture
  getSalesReceipts: (storeId: string, date?: string) => {
    const params = date ? `?date=${date}` : '';
    return request<{ receipts: SalesReceipt[] }>(`/sales-capture/${storeId}/receipts${params}`);
  },
  getUploadUrl: (storeId: string, fileName: string, contentType?: string) =>
    request<UploadUrlResponse>(`/sales-capture/${storeId}/upload-url`, {
      method: 'POST',
      body: JSON.stringify({ fileName, contentType }),
    }),
  createSalesReceipt: (storeId: string, data: { businessDate: string; filePath: string; fileName: string; sourceType?: string }) =>
    request<{ receipt: SalesReceipt }>(`/sales-capture/${storeId}/receipts`, { method: 'POST', body: JSON.stringify(data) }),
  getSalesClose: (storeId: string, date: string) =>
    request<{ close: SalesClose | null }>(`/sales-capture/${storeId}/closes/${date}`),
  saveSalesClose: (storeId: string, data: Omit<SalesClose, 'id' | 'approvedBy' | 'approvedAt'>) =>
    request<{ close: SalesClose }>(`/sales-capture/${storeId}/closes`, { method: 'POST', body: JSON.stringify(data) }),
  approveSalesClose: (storeId: string, date: string) =>
    request<OkResponse>(`/sales-capture/${storeId}/closes/${date}/approve`, { method: 'POST' }),
  getCashClose: (storeId: string, date: string) =>
    request<{ cashClose: CashClose | null }>(`/sales-capture/${storeId}/cash-close/${date}`),
  saveCashClose: (storeId: string, data: { businessDate: string; expectedCash: number; countedCash: number; note?: string }) =>
    request<{ close: CashClose }>(`/sales-capture/${storeId}/cash-close`, { method: 'POST', body: JSON.stringify(data) }),

  // ========== Attendance (LINE打刻) ==========
  getAttendanceToday: (storeId: string) =>
    request<AttendanceTodayResponse>(`/attendance/me/today?storeId=${storeId}`),
  attendanceClockIn: (storeId: string, source?: string, idempotencyKey?: string) =>
    request<AttendanceActionResponse>('/attendance/clock-in', { method: 'POST', body: JSON.stringify({ storeId, source, idempotencyKey }) }),
  attendanceBreakStart: (storeId: string, reason?: string, idempotencyKey?: string) =>
    request<AttendanceActionResponse>('/attendance/break-start', { method: 'POST', body: JSON.stringify({ storeId, reason, idempotencyKey }) }),
  attendanceBreakEnd: (storeId: string, idempotencyKey?: string) =>
    request<AttendanceActionResponse>('/attendance/break-end', { method: 'POST', body: JSON.stringify({ storeId, idempotencyKey }) }),
  attendanceClockOut: (storeId: string, idempotencyKey?: string) =>
    request<AttendanceActionResponse>('/attendance/clock-out', { method: 'POST', body: JSON.stringify({ storeId, idempotencyKey }) }),
  getAttendanceHistory: (storeId: string, month?: string) =>
    request<{ records: AttendanceTodayResponse[] }>(`/attendance/me/history?storeId=${storeId}${month ? `&month=${month}` : ''}`),
  createCorrection: (storeId: string, data: {
    attendanceRecordId?: string | null;
    requestedBusinessDate?: string;
    requestType?: string;
    beforeSnapshot?: Record<string, unknown>;
    afterSnapshot?: Record<string, unknown>;
    reason?: string;
    comment?: string;
  }) =>
    request<{ correction: AttendanceCorrection }>('/attendance/corrections', { method: 'POST', body: JSON.stringify({ storeId, ...data }) }),
  getMyCorrections: (storeId: string) =>
    request<{ corrections: AttendanceCorrection[] }>(`/attendance/corrections/me?storeId=${storeId}`),

  // Admin Attendance
  getAdminAttendanceToday: (storeId: string, status?: string, q?: string) => {
    const params = new URLSearchParams({ storeId });
    if (status) params.set('status', status);
    if (q) params.set('q', q);
    return request<{ staff: AdminTodayStaff[] }>(`/attendance/admin/today?${params}`);
  },
  getAdminAttendanceMonthly: (storeId: string, month?: string) =>
    request<{ summary: AdminMonthlySummary[] }>(`/attendance/admin/monthly?storeId=${storeId}${month ? `&month=${month}` : ''}`),
  getAdminStaffAttendance: (storeId: string, userId: string, month?: string) =>
    request<{ summary: AdminMonthlySummary; records: AttendanceTodayResponse[] }>(`/attendance/admin/staff/${userId}?storeId=${storeId}${month ? `&month=${month}` : ''}`),
  adminUpdateRecord: (storeId: string, recordId: string, data: { clockInAt?: string; clockOutAt?: string; breakMinutes?: number; note?: string }) =>
    request<OkResponse>(`/attendance/admin/records/${recordId}`, { method: 'PATCH', body: JSON.stringify({ storeId, ...data }) }),
  adminDeleteRecord: (storeId: string, recordId: string) =>
    request<OkResponse>(`/attendance/admin/records/${recordId}?storeId=${storeId}`, {
      method: 'DELETE',
    }),
  getAdminCorrections: (storeId: string) =>
    request<{ corrections: AttendanceCorrection[] }>(`/attendance/admin/corrections?storeId=${storeId}`),
  approveCorrection: (storeId: string, correctionId: string, comment?: string) =>
    request<OkResponse>(`/attendance/admin/corrections/${correctionId}/approve`, { method: 'POST', body: JSON.stringify({ storeId, comment }) }),
  rejectCorrection: (storeId: string, correctionId: string, comment?: string) =>
    request<OkResponse>(`/attendance/admin/corrections/${correctionId}/reject`, { method: 'POST', body: JSON.stringify({ storeId, comment }) }),
  getAttendancePolicy: (storeId: string) =>
    request<{ policy: {
      timezone: string;
      business_day_cutoff_hour?: number;
      rounding_unit_minutes?: number;
      rounding_mode?: string;
      auto_close_break_before_clock_out?: boolean;
      require_manager_approval?: boolean;
    } }>(`/attendance/admin/policy?storeId=${storeId}`),
  updateAttendancePolicy: (storeId: string, data: {
    timezone?: string;
    businessDayCutoffHour?: number;
    roundingUnitMinutes?: number;
    roundingMode?: string;
    autoCloseBreakBeforeClockOut?: boolean;
    requireManagerApproval?: boolean;
  }) =>
    request<{ policy: {
      timezone: string;
      business_day_cutoff_hour?: number;
      rounding_unit_minutes?: number;
      rounding_mode?: string;
      auto_close_break_before_clock_out?: boolean;
      require_manager_approval?: boolean;
    } }>('/attendance/admin/policy', { method: 'PUT', body: JSON.stringify({ storeId, ...data }) }),

  // LINE
  getLineLoginUrl: (storeId: string) => request<LineLoginUrlResponse>(`/auth/line/login?storeId=${storeId}`),
  lineCallback: (storeId: string, code: string, state?: string) =>
    request<{ linked: boolean; lineUserId?: string; displayName?: string; pictureUrl?: string }>('/auth/line/callback', { method: 'POST', body: JSON.stringify({ storeId, code, state }) }),
  lineLinkWithCode: (code: string, lineUserId: string, displayName?: string, pictureUrl?: string) =>
    request<OkResponse>('/auth/line/link-with-code', { method: 'POST', body: JSON.stringify({ code, lineUserId, displayName, pictureUrl }) }),
  lineResolve: (lineUserId: string) =>
    request<OkResponse>('/auth/line/resolve', { method: 'POST', body: JSON.stringify({ lineUserId }) }),
  getLineMe: () => request<{ lineLink: LineLink | null; profile: { name?: string; picture?: string } | null }>('/auth/line/me'),
  adminIssueLinkToken: (storeId: string, userId: string) =>
    request<{ token: string }>('/auth/line/admin/link-tokens', { method: 'POST', body: JSON.stringify({ storeId, userId }) }),
  adminGetLineLinks: (storeId: string) =>
    request<{ staff: LineLink[] }>(`/auth/line/admin/links?storeId=${storeId}`),

  // Kiosk PIN管理（管理者用）
  setKioskPin: (storeId: string, pin: string) =>
    request<OkResponse>(`/kiosk/${storeId}/pin`, { method: 'PUT', body: JSON.stringify({ pin }) }),

  // SwitchBot
  getSwitchBotDevices: (storeId: string) =>
    request<{ devices: Array<{ deviceId: string; deviceName: string; deviceType: string }> }>(`/switchbot/${storeId}/devices`),
  getSwitchBotDeviceStatus: (storeId: string, deviceId: string) =>
    request<{ deviceId: string; deviceName: string; temperature: number | null; humidity: number | null; battery: number | null }>(`/switchbot/${storeId}/devices/${deviceId}/status`),

  // HACCP テンプレート管理
  getHaccpTemplates: (storeId: string) =>
    request<{ templates: HaccpTemplate[] }>(`/haccp/${storeId}/templates`),
  createHaccpTemplate: (storeId: string, data: { name: string; timing: string; description?: string }) =>
    request<{ template: HaccpTemplate }>(`/haccp/${storeId}/templates`, { method: 'POST', body: JSON.stringify(data) }),
  updateHaccpTemplate: (storeId: string, id: string, data: Partial<Pick<HaccpTemplate, 'name' | 'timing' | 'scope' | 'description'>>) =>
    request<{ template: HaccpTemplate }>(`/haccp/${storeId}/templates/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteHaccpTemplate: (storeId: string, id: string) =>
    request<OkResponse>(`/haccp/${storeId}/templates/${id}`, { method: 'DELETE' }),
  addHaccpItem: (storeId: string, templateId: string, data: Omit<HaccpItem, 'id' | 'templateId'>) =>
    request<{ item: HaccpItem }>(`/haccp/${storeId}/templates/${templateId}/items`, { method: 'POST', body: JSON.stringify(data) }),
  updateHaccpItem: (storeId: string, templateId: string, itemId: string, data: Partial<Pick<HaccpItem, 'name' | 'type' | 'unit' | 'minValue' | 'maxValue' | 'options' | 'displayOrder'>>) =>
    request<{ item: HaccpItem }>(`/haccp/${storeId}/templates/${templateId}/items/${itemId}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteHaccpItem: (storeId: string, templateId: string, itemId: string) =>
    request<OkResponse>(`/haccp/${storeId}/templates/${templateId}/items/${itemId}`, { method: 'DELETE' }),
  getHaccpSystemTemplates: (storeId: string) =>
    request<{ templates: HaccpTemplate[] }>(`/haccp/${storeId}/system-templates`),
  importHaccpSystemTemplate: (storeId: string, systemTemplateId: string) =>
    request<{ template: HaccpTemplate }>(`/haccp/${storeId}/import/${systemTemplateId}`, { method: 'POST' }),

  // Kiosk
  getKioskStaff: (storeId: string) =>
    request<{ staff: KioskStaff[] }>(`/kiosk/${storeId}/staff`),
};
