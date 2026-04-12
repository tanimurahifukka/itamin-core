import { supabase } from './supabase';
import type {
  Store,
  StoreAccount,
  StaffMember,
  Invitation,
  AuditLogEntry,
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
  Customer,
  CustomerListResponse,
  CustomerDuplicateCheck,
  ReservationRow,
  ReservationTable,
  ReservationBusinessHour,
  PublicStoreInfo,
  AvailabilitySlot,
  PublicReservationSummary,
  ReservationTimeslot,
  PublicTimeslotAvailability,
  ReservationSchool,
  ReservationSchoolSession,
  PublicSchoolSessionAvailability,
  ReservationEvent,
  PublicEventAvailability,
  StoreBusinessHour,
  StoreCalendarOverride,
  CalendarOverrideKind,
  EffectiveHours,
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

/**
 * Authorization ヘッダー付きで Blob をダウンロードし、
 * Blob と Content-Disposition から抽出したファイル名を返す。
 */
async function downloadBlob(path: string): Promise<{ blob: Blob; filename: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new ApiRequestError(body.error || `HTTP ${res.status}`, res.status, body);
  }

  const blob = await res.blob();
  // Content-Disposition: attachment; filename="attendance_xxx_2026-04_detail.csv"
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match ? match[1] : 'attendance.csv';
  return { blob, filename };
}

export const api = {
  // Stores
  getStores: () => request<{ stores: Store[] }>('/stores'),
  createStore: (name: string, address?: string) =>
    request<{ store: Store }>('/stores', { method: 'POST', body: JSON.stringify({ name, address }) }),
  joinStoreByToken: (storeId: string, inviteToken: string) =>
    request<{ ok: boolean; message: string; storeName: string }>(`/stores/${storeId}/join-member`, {
      method: 'POST',
      body: JSON.stringify({ inviteToken }),
    }),
  getStorePublicInfo: (storeId: string) =>
    request<{ store: { id: string; name: string } }>(`/stores/${storeId}/info`),
  getStoreAccount: (storeId: string) => request<{ account: StoreAccount }>(`/stores/${storeId}/account`),
  updateStoreAccount: (
    storeId: string,
    updates: { name: string; address?: string; phone?: string; slug?: string; openTime?: string; closeTime?: string }
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
  assignExistingStaff: (storeId: string, userId: string, role?: string) =>
    request<{ ok: boolean; staffId: string; userName: string; message: string }>(`/stores/${storeId}/staff/assign-existing`, {
      method: 'POST',
      body: JSON.stringify({ userId, role }),
    }),
  removeStaff: (storeId: string, staffId: string) =>
    request<OkResponse>(`/stores/${storeId}/staff/${staffId}`, { method: 'DELETE' }),
  resetStaffPassword: (storeId: string, staffId: string, password?: string) =>
    request<{ ok: boolean; message: string; password: string; forceChange: boolean }>(
      `/stores/${storeId}/staff/${staffId}/reset-password`,
      { method: 'POST', body: JSON.stringify(password ? { password } : {}) }
    ),
  getAuditLog: (storeId: string, action?: string, limit = 50) => {
    const params = new URLSearchParams();
    if (action) params.set('action', action);
    params.set('limit', String(limit));
    return request<{ entries: AuditLogEntry[] }>(`/stores/${storeId}/audit-log?${params}`);
  },
  // スタッフ PIN (NFC 清掃 / NFC 打刻で共用)
  getMyStaffPin: (storeId: string) =>
    request<{ pin: string | null }>(`/stores/${storeId}/staff-pins/me`),
  listStaffPins: (storeId: string) =>
    request<{ pins: { membershipId: string; pin: string; updatedAt: string; staffName: string }[] }>(
      `/stores/${storeId}/staff-pins`
    ),
  regenerateStaffPin: (storeId: string, staffId: string) =>
    request<{ ok: boolean; pin: string; staffName: string | null }>(
      `/stores/${storeId}/staff-pins/${staffId}/regenerate`,
      { method: 'POST' }
    ),
  deleteStaffPin: (storeId: string, staffId: string) =>
    request<OkResponse>(`/stores/${storeId}/staff-pins/${staffId}`, { method: 'DELETE' }),
  // NFC cleaning: locations
  listNfcLocations: (storeId: string) =>
    request<{
      locations: {
        id: string;
        slug: string;
        name: string;
        templateId: string | null;
        templateName: string | null;
        active: boolean;
        createdAt: string;
        updatedAt: string;
        url: string;
      }[];
    }>(`/stores/${storeId}/nfc-locations`),
  createNfcLocation: (storeId: string, input: { name: string; slug: string; templateId: string | null }) =>
    request<{
      ok: boolean;
      location: { id: string; slug: string; name: string; template_id: string | null; active: boolean; url: string };
    }>(`/stores/${storeId}/nfc-locations`, { method: 'POST', body: JSON.stringify(input) }),
  updateNfcLocation: (
    storeId: string,
    id: string,
    patch: { name?: string; slug?: string; templateId?: string | null; active?: boolean }
  ) => request<OkResponse>(`/stores/${storeId}/nfc-locations/${id}`, { method: 'PUT', body: JSON.stringify(patch) }),
  deleteNfcLocation: (storeId: string, id: string) =>
    request<OkResponse>(`/stores/${storeId}/nfc-locations/${id}`, { method: 'DELETE' }),
  listChecklistTemplatesForStore: (storeId: string) =>
    request<{ templates: { id: string; name: string; description: string | null; scope: string; timing: string }[] }>(
      `/stores/${storeId}/checklist-templates`
    ),
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
  deleteTimeRecord: (storeId: string, recordId: string) =>
    request<OkResponse>(`/timecard/${storeId}/records/${recordId}`, {
      method: 'DELETE',
    }),
  createTimeRecord: (storeId: string, body: { staffId: string; clockIn: string; clockOut?: string | null; breakMinutes?: number }) =>
    request<{ record: TimeRecord }>(`/timecard/${storeId}/records`, {
      method: 'POST',
      body: JSON.stringify(body),
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
    return request<{ staffOvertime: StaffOvertimeInfo[]; settings: { monthlyLimitHours: number; standardHoursPerDay: number } }>(`/overtime-alert/${storeId}/monthly?${params}`);
  },

  // Consecutive Work
  getConsecutiveWork: (storeId: string) =>
    request<{ staffStatus: StaffConsecutiveInfo[] }>(`/consecutive-work/${storeId}/status`),

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
    return request<{ expenses: Expense[]; summary: ExpenseSummary }>(`/expense/${storeId}/items?${params}`);
  },
  addExpense: (storeId: string, data: { date: string; category: string; description: string; amount: number; receiptNote?: string }) =>
    request<{ expense: Expense }>(`/expense/${storeId}/items`, { method: 'POST', body: JSON.stringify(data) }),
  updateExpense: (storeId: string, expenseId: string, updates: Partial<Pick<Expense, 'date' | 'category' | 'description' | 'amount' | 'receiptNote'>>) =>
    request<{ expense: Expense }>(`/expense/${storeId}/items/${expenseId}`, { method: 'PUT', body: JSON.stringify(updates) }),
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
  getSwitchBotMonitoredDevices: (storeId: string) =>
    request<{ monitoredDevices: string[] }>(`/switchbot/${storeId}/devices/monitored`),
  setSwitchBotMonitoredDevices: (storeId: string, deviceIds: string[]) =>
    request<{ ok: boolean }>(`/switchbot/${storeId}/devices/monitored`, {
      method: 'PUT',
      body: JSON.stringify({ deviceIds }),
    }),

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

  // Customers
  getCustomers: (storeId: string, params?: { q?: string; tag?: string; limit?: number; offset?: number; include_deleted?: boolean }) => {
    const qs = new URLSearchParams();
    if (params?.q) qs.set('q', params.q);
    if (params?.tag) qs.set('tag', params.tag);
    if (params?.limit !== undefined) qs.set('limit', String(params.limit));
    if (params?.offset !== undefined) qs.set('offset', String(params.offset));
    if (params?.include_deleted) qs.set('include_deleted', 'true');
    const query = qs.toString();
    return request<CustomerListResponse>(`/customers/${storeId}${query ? `?${query}` : ''}`);
  },
  getCustomer: (storeId: string, customerId: string) =>
    request<Customer>(`/customers/${storeId}/${customerId}`),
  createCustomer: (storeId: string, data: Partial<Omit<Customer, 'id' | 'store_id' | 'created_at' | 'updated_at' | 'deleted_at' | 'phone_normalized'>>) =>
    request<Customer>(`/customers/${storeId}`, { method: 'POST', body: JSON.stringify(data) }),
  updateCustomer: (storeId: string, customerId: string, data: Partial<Omit<Customer, 'id' | 'store_id' | 'created_at' | 'updated_at' | 'deleted_at' | 'phone_normalized'>>) =>
    request<Customer>(`/customers/${storeId}/${customerId}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCustomer: (storeId: string, customerId: string) =>
    request<OkResponse>(`/customers/${storeId}/${customerId}`, { method: 'DELETE' }),
  checkCustomerDuplicate: (storeId: string, phone: string) =>
    request<CustomerDuplicateCheck>(`/customers/${storeId}/duplicate-check?phone=${encodeURIComponent(phone)}`),

  // ============================================================
  // Reservation — store slug (shared)
  // ============================================================
  getReservationSlug: (storeId: string) =>
    request<{ slug: string | null }>(`/reservation/${storeId}/slug`),
  setReservationSlug: (storeId: string, slug: string) =>
    request<{ slug: string | null }>(`/reservation/${storeId}/slug`, {
      method: 'PUT',
      body: JSON.stringify({ slug }),
    }),

  // ============================================================
  // Reservation — table (admin)
  // ============================================================
  listReservationTables: (storeId: string) =>
    request<{ tables: ReservationTable[] }>(`/reservation/table/${storeId}/tables`),
  createReservationTable: (
    storeId: string,
    data: Omit<ReservationTable, 'id' | 'store_id'>,
  ) =>
    request<{ table: ReservationTable }>(`/reservation/table/${storeId}/tables`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateReservationTable: (
    storeId: string,
    tableId: string,
    patch: Partial<Omit<ReservationTable, 'id' | 'store_id'>>,
  ) =>
    request<{ table: ReservationTable }>(
      `/reservation/table/${storeId}/tables/${tableId}`,
      { method: 'PATCH', body: JSON.stringify(patch) },
    ),
  deleteReservationTable: (storeId: string, tableId: string) =>
    request<OkResponse>(`/reservation/table/${storeId}/tables/${tableId}`, {
      method: 'DELETE',
    }),

  getReservationBusinessHours: (storeId: string) =>
    request<{ hours: ReservationBusinessHour[] }>(
      `/reservation/table/${storeId}/business-hours`,
    ),
  setReservationBusinessHours: (storeId: string, hours: ReservationBusinessHour[]) =>
    request<OkResponse>(`/reservation/table/${storeId}/business-hours`, {
      method: 'PUT',
      body: JSON.stringify({ hours }),
    }),

  listTableReservations: (
    storeId: string,
    params: { from?: string; to?: string; status?: string } = {},
  ) => {
    const qs = new URLSearchParams();
    if (params.from) qs.set('from', params.from);
    if (params.to) qs.set('to', params.to);
    if (params.status) qs.set('status', params.status);
    const q = qs.toString();
    return request<{ reservations: ReservationRow[] }>(
      `/reservation/table/${storeId}/reservations${q ? `?${q}` : ''}`,
    );
  },
  createTableReservation: (
    storeId: string,
    data: {
      starts_at: string;
      ends_at: string;
      party_size: number;
      table_id?: string | null;
      customer_name: string;
      customer_phone?: string;
      customer_email?: string;
      notes?: string;
    },
  ) =>
    request<{ reservation: ReservationRow }>(
      `/reservation/table/${storeId}/reservations`,
      { method: 'POST', body: JSON.stringify(data) },
    ),
  updateTableReservation: (
    storeId: string,
    reservationId: string,
    patch: Record<string, unknown>,
  ) =>
    request<{ reservation: ReservationRow }>(
      `/reservation/table/${storeId}/reservations/${reservationId}`,
      { method: 'PATCH', body: JSON.stringify(patch) },
    ),
  cancelTableReservation: (storeId: string, reservationId: string, reason?: string) =>
    request<{ reservation: ReservationRow }>(
      `/reservation/table/${storeId}/reservations/${reservationId}/cancel`,
      { method: 'POST', body: JSON.stringify({ reason }) },
    ),

  // ============================================================
  // Reservation — public (slug based, no auth)
  // ============================================================
  getPublicStoreBySlug: (slug: string) =>
    request<{ store: PublicStoreInfo; available: string[] }>(`/public/r/${slug}`),
  getPublicTableAvailability: (slug: string, date: string, partySize: number) =>
    request<{ slots: AvailabilitySlot[]; duration_minutes?: number; reason?: string }>(
      `/public/r/${slug}/table/availability?date=${date}&party_size=${partySize}`,
    ),
  createPublicTableReservation: (
    slug: string,
    data: {
      starts_at: string;
      party_size: number;
      customer_name: string;
      customer_phone?: string;
      customer_email: string;
      notes?: string;
    },
  ) =>
    request<{ reservation: PublicReservationSummary }>(
      `/public/r/${slug}/table/reservations`,
      { method: 'POST', body: JSON.stringify(data) },
    ),
  getPublicReservation: (slug: string, code: string) =>
    request<{
      reservation: {
        id: string;
        confirmation_code: string;
        status: string;
        starts_at: string;
        ends_at: string;
        party_size: number;
        customer_name: string;
        reservation_type: string;
      };
    }>(`/public/r/${slug}/reservations/${code}`),
  cancelPublicReservation: (slug: string, code: string, email: string) =>
    request<{ reservation: { id: string; status: string } }>(
      `/public/r/${slug}/reservations/${code}/cancel`,
      { method: 'POST', body: JSON.stringify({ email }) },
    ),

  // ============================================================
  // Reservation — timeslot
  // ============================================================
  listReservationTimeslots: (storeId: string) =>
    request<{ timeslots: ReservationTimeslot[] }>(
      `/reservation/timeslot/${storeId}/timeslots`,
    ),
  createReservationTimeslot: (
    storeId: string,
    data: Omit<ReservationTimeslot, 'id' | 'store_id'>,
  ) =>
    request<{ timeslot: ReservationTimeslot }>(
      `/reservation/timeslot/${storeId}/timeslots`,
      { method: 'POST', body: JSON.stringify(data) },
    ),
  updateReservationTimeslot: (
    storeId: string,
    id: string,
    patch: Partial<Omit<ReservationTimeslot, 'id' | 'store_id'>>,
  ) =>
    request<{ timeslot: ReservationTimeslot }>(
      `/reservation/timeslot/${storeId}/timeslots/${id}`,
      { method: 'PATCH', body: JSON.stringify(patch) },
    ),
  deleteReservationTimeslot: (storeId: string, id: string) =>
    request<OkResponse>(`/reservation/timeslot/${storeId}/timeslots/${id}`, {
      method: 'DELETE',
    }),
  listTimeslotReservations: (storeId: string, from?: string, to?: string) => {
    const q = new URLSearchParams();
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    const qs = q.toString();
    return request<{ reservations: ReservationRow[] }>(
      `/reservation/timeslot/${storeId}/reservations${qs ? `?${qs}` : ''}`,
    );
  },
  cancelTimeslotReservation: (storeId: string, reservationId: string, reason?: string) =>
    request<{ reservation: ReservationRow }>(
      `/reservation/timeslot/${storeId}/reservations/${reservationId}/cancel`,
      { method: 'POST', body: JSON.stringify({ reason }) },
    ),
  getPublicTimeslotAvailability: (slug: string, date: string) =>
    request<{ slots: PublicTimeslotAvailability[]; reason?: string }>(
      `/public/r/${slug}/timeslot/availability?date=${date}`,
    ),
  createPublicTimeslotReservation: (
    slug: string,
    data: {
      timeslot_id: string;
      date: string;
      party_size: number;
      customer_name: string;
      customer_phone?: string;
      customer_email: string;
      notes?: string;
    },
  ) =>
    request<{ reservation: PublicReservationSummary }>(
      `/public/r/${slug}/timeslot/reservations`,
      { method: 'POST', body: JSON.stringify(data) },
    ),

  // ============================================================
  // Reservation — school
  // ============================================================
  listReservationSchools: (storeId: string) =>
    request<{ schools: ReservationSchool[] }>(`/reservation/school/${storeId}/schools`),
  createReservationSchool: (
    storeId: string,
    data: Omit<ReservationSchool, 'id' | 'store_id'>,
  ) =>
    request<{ school: ReservationSchool }>(`/reservation/school/${storeId}/schools`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateReservationSchool: (
    storeId: string,
    id: string,
    patch: Partial<Omit<ReservationSchool, 'id' | 'store_id'>>,
  ) =>
    request<{ school: ReservationSchool }>(
      `/reservation/school/${storeId}/schools/${id}`,
      { method: 'PATCH', body: JSON.stringify(patch) },
    ),
  deleteReservationSchool: (storeId: string, id: string) =>
    request<OkResponse>(`/reservation/school/${storeId}/schools/${id}`, {
      method: 'DELETE',
    }),
  listSchoolSessions: (storeId: string, schoolId: string) =>
    request<{ sessions: ReservationSchoolSession[] }>(
      `/reservation/school/${storeId}/schools/${schoolId}/sessions`,
    ),
  createSchoolSession: (
    storeId: string,
    schoolId: string,
    data: {
      starts_at: string;
      ends_at: string;
      capacity_override?: number | null;
      note?: string | null;
    },
  ) =>
    request<{ session: ReservationSchoolSession }>(
      `/reservation/school/${storeId}/schools/${schoolId}/sessions`,
      { method: 'POST', body: JSON.stringify(data) },
    ),
  deleteSchoolSession: (storeId: string, sessionId: string) =>
    request<OkResponse>(`/reservation/school/${storeId}/sessions/${sessionId}`, {
      method: 'DELETE',
    }),
  listSchoolReservations: (storeId: string) =>
    request<{ reservations: ReservationRow[] }>(
      `/reservation/school/${storeId}/reservations`,
    ),
  cancelSchoolReservation: (storeId: string, reservationId: string, reason?: string) =>
    request<{ reservation: ReservationRow }>(
      `/reservation/school/${storeId}/reservations/${reservationId}/cancel`,
      { method: 'POST', body: JSON.stringify({ reason }) },
    ),
  getPublicSchoolCourses: (slug: string) =>
    request<{ courses: ReservationSchool[] }>(`/public/r/${slug}/school/courses`),
  getPublicSchoolSessions: (slug: string, schoolId: string) =>
    request<{
      course: ReservationSchool;
      sessions: PublicSchoolSessionAvailability[];
    }>(`/public/r/${slug}/school/courses/${schoolId}/sessions`),
  createPublicSchoolReservation: (
    slug: string,
    data: {
      session_id: string;
      party_size: number;
      customer_name: string;
      customer_phone?: string;
      customer_email: string;
      notes?: string;
    },
  ) =>
    request<{ reservation: PublicReservationSummary }>(
      `/public/r/${slug}/school/reservations`,
      { method: 'POST', body: JSON.stringify(data) },
    ),

  // ============================================================
  // Reservation — event
  // ============================================================
  listReservationEvents: (storeId: string) =>
    request<{ events: ReservationEvent[] }>(`/reservation/event/${storeId}/events`),
  createReservationEvent: (
    storeId: string,
    data: Omit<ReservationEvent, 'id' | 'store_id'>,
  ) =>
    request<{ event: ReservationEvent }>(`/reservation/event/${storeId}/events`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateReservationEvent: (
    storeId: string,
    id: string,
    patch: Partial<Omit<ReservationEvent, 'id' | 'store_id'>>,
  ) =>
    request<{ event: ReservationEvent }>(
      `/reservation/event/${storeId}/events/${id}`,
      { method: 'PATCH', body: JSON.stringify(patch) },
    ),
  deleteReservationEvent: (storeId: string, id: string) =>
    request<OkResponse>(`/reservation/event/${storeId}/events/${id}`, {
      method: 'DELETE',
    }),
  listEventReservations: (storeId: string) =>
    request<{ reservations: ReservationRow[] }>(
      `/reservation/event/${storeId}/reservations`,
    ),
  cancelEventReservation: (storeId: string, reservationId: string, reason?: string) =>
    request<{ reservation: ReservationRow }>(
      `/reservation/event/${storeId}/reservations/${reservationId}/cancel`,
      { method: 'POST', body: JSON.stringify({ reason }) },
    ),
  getPublicEvents: (slug: string) =>
    request<{ events: PublicEventAvailability[] }>(`/public/r/${slug}/event/events`),

  // ============================================================
  // Calendar — 営業日カレンダー
  // ============================================================
  getBusinessHours: (storeId: string) =>
    request<{ hours: StoreBusinessHour[] }>(`/calendar/${storeId}/business-hours`),
  updateBusinessHours: (storeId: string, hours: StoreBusinessHour[]) =>
    request<OkResponse>(`/calendar/${storeId}/business-hours`, {
      method: 'PUT',
      body: JSON.stringify({ hours }),
    }),
  listCalendarOverrides: (storeId: string, from: string, to: string) =>
    request<{ overrides: StoreCalendarOverride[] }>(
      `/calendar/${storeId}/overrides?from=${from}&to=${to}`,
    ),
  createCalendarOverride: (
    storeId: string,
    data: {
      date: string;
      kind: CalendarOverrideKind;
      open_time?: string | null;
      close_time?: string | null;
      label?: string | null;
    },
  ) =>
    request<{ override: StoreCalendarOverride }>(`/calendar/${storeId}/overrides`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateCalendarOverride: (
    storeId: string,
    id: string,
    patch: Partial<Omit<StoreCalendarOverride, 'id' | 'date'>>,
  ) =>
    request<{ override: StoreCalendarOverride }>(
      `/calendar/${storeId}/overrides/${id}`,
      { method: 'PATCH', body: JSON.stringify(patch) },
    ),
  deleteCalendarOverride: (storeId: string, id: string) =>
    request<OkResponse>(`/calendar/${storeId}/overrides/${id}`, { method: 'DELETE' }),
  getEffectiveHours: (storeId: string, from: string, to: string) =>
    request<{ days: EffectiveHours[] }>(
      `/calendar/${storeId}/effective?from=${from}&to=${to}`,
    ),
  createPublicEventReservation: (
    slug: string,
    data: {
      event_id: string;
      party_size: number;
      customer_name: string;
      customer_phone?: string;
      customer_email: string;
      notes?: string;
    },
  ) =>
    request<{ reservation: PublicReservationSummary }>(
      `/public/r/${slug}/event/reservations`,
      { method: 'POST', body: JSON.stringify(data) },
    ),

  // 勤怠 CSV エクスポート
  exportAttendanceCsv: (
    storeId: string,
    year: number,
    month: number,
    mode: 'detail' | 'summary',
  ): Promise<{ blob: Blob; filename: string }> => {
    const params = new URLSearchParams({
      year: String(year),
      month: String(month),
      mode,
    });
    return downloadBlob(`/timecard/${storeId}/export?${params}`);
  },
};
