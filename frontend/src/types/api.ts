// API response type definitions for itamin-core
// All types are based on the backend response structures

// ============================================================
// Common
// ============================================================

export interface ApiError {
  error: string;
}

export interface OkResponse {
  ok: boolean;
  message?: string;
}

// ============================================================
// Store
// ============================================================

export interface Store {
  id: string;
  name: string;
  address?: string;
  role: string;
}

export interface StoreAccount {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  openTime?: string;
  closeTime?: string;
}

export interface StaffMember {
  id: string;
  role: string;
  hourlyWage?: number;
  transportFee?: number;
  joinedAt?: string;
  userId: string;
  userName: string;
  email?: string;
  picture?: string;
  lastSignInAt?: string;
}

export interface Invitation {
  id: string;
  name: string;
  email: string;
  role: string;
  hourlyWage?: number;
  createdAt: string;
}

// 旧 TimeRecord / TimecardStatus / MonthlySummaryStaff は削除済み
// （unified attendance プラグインが AttendanceTodayResponse 等で置き換える）

// ============================================================
// Plugin Settings
// ============================================================

export interface PluginInfo {
  name: string;
  version: string;
  description: string;
  label: string;
  icon: string;
  core?: boolean;
  defaultRoles: string[];
  settingsSchema: PluginSettingField[];
  enabled: boolean;
  config: Record<string, unknown>;
  allowedRoles: string[];
  displayOrder: number;
}

export interface PluginSettingField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'boolean' | 'select' | 'password';
  default?: string | number | boolean;
  options?: { value: string; label: string }[];
  description?: string;
}

// ============================================================
// Shift
// ============================================================

export interface Shift {
  id: string;
  staffId: string;
  staffName?: string;
  date: string;
  startTime: string;
  endTime: string;
  breakMinutes?: number;
  note?: string;
  status?: string;
}

export interface ShiftRequest {
  id: string;
  staffId: string;
  staffName?: string;
  date: string;
  requestType: string;
  startTime?: string;
  endTime?: string;
  note?: string;
}

export interface ShiftTemplate {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  breakMinutes?: number;
  color?: string;
}

// ============================================================
// Inventory
// ============================================================

export interface InventoryItem {
  id: string;
  storeId: string;
  name: string;
  category?: string;
  unit?: string;
  quantity: number;
  minQuantity?: number;
  cost?: number;
  note?: string;
  status?: string;
  lastCheckedAt?: string;
  updatedAt: string;
  createdAt: string;
}

// ============================================================
// DailyReport
// ============================================================

export interface DailyReport {
  id: string;
  storeId: string;
  date: string;
  sales: number;
  customerCount: number;
  weather: string;
  memo: string;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
}

export interface DailyReportItem {
  id: string;
  menuItemId: string;
  menuItemName?: string;
  quantity: number;
  unitPrice?: number;
  subtotal?: number;
}

export interface DailyReportSummary {
  totalSales: number;
  totalCustomers: number;
  avgCustomers: number;
  reportCount: number;
}

// ============================================================
// Notice
// ============================================================

export interface Notice {
  id: string;
  storeId: string;
  authorId: string;
  authorName: string;
  title: string;
  body: string;
  pinned: boolean;
  imageUrls?: string[];
  createdAt: string;
  commentCount: number;
  isRead?: boolean;
  readAt?: string;
}

export interface NoticeComment {
  id: string;
  noticeId: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
  updatedAt?: string;
}

// ============================================================
// PaidLeave
// ============================================================

export interface PaidLeaveSummary {
  id: string;
  staffId: string;
  staffName: string;
  totalDays: number;
  usedDays: number;
  remainingDays: number;
  fiscalYear: number;
}

export interface LeaveRecord {
  id: string;
  storeId: string;
  staffId: string;
  date: string;
  type: string;
  note?: string;
}

// ============================================================
// Expense
// ============================================================

export interface Expense {
  id: string;
  storeId: string;
  date: string;
  category: string;
  description: string;
  amount: number;
  receiptNote?: string;
  createdBy: string;
  createdAt: string;
}

export interface ExpenseSummary {
  totalAmount: number;
  categorySummary: Record<string, number>;
  count: number;
}

// ============================================================
// Feedback
// ============================================================

export interface FeedbackItem {
  id: string;
  storeId: string;
  date: string;
  type: string;
  content: string;
  response?: string;
  status: string;
  createdBy: string;
  createdAt: string;
}

// ============================================================
// Menu
// ============================================================

export interface MenuItem {
  id: string;
  storeId: string;
  name: string;
  category?: string;
  price: number;
  displayOrder?: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// SalesCapture
// ============================================================

export interface SalesReceipt {
  id: string;
  storeId: string;
  businessDate: string;
  sourceType?: string;
  filePath: string;
  fileName: string;
  parsedSummary?: unknown;
  confidence?: number;
  status: string;
  uploadedBy: string;
  uploadedByName?: string;
  reviewedBy?: string;
  uploadedAt: string;
  reviewedAt?: string;
}

export interface SalesClose {
  id: string;
  businessDate: string;
  registerCode?: string;
  grossSales: number;
  netSales: number;
  taxAmount?: number;
  discountAmount?: number;
  refundAmount?: number;
  cashSales: number;
  cardSales: number;
  qrSales: number;
  otherSales?: number;
  receiptCount: number;
  approvedBy?: string;
  approvedAt?: string;
}

export interface CashClose {
  id: string;
  businessDate: string;
  expectedCash: number;
  countedCash: number;
  overShort: number;
  note?: string;
}

export interface UploadUrlResponse {
  signedUrl: string;
  token: string;
  path: string;
}

// ============================================================
// OvertimeAlert
// ============================================================

export interface StaffOvertimeInfo {
  userId: string;
  name: string;
  role: string;
  totalWorkHours: number;
  totalDays: number;
  overtimeHours: number;
  limitHours: number;
  exceeded: boolean;
  warning: boolean;
}

// ============================================================
// ConsecutiveWork
// ============================================================

export interface StaffConsecutiveInfo {
  userId: string;
  name: string;
  role: string;
  consecutiveDays: number;
  level: string;
}

// ============================================================
// Attendance (LINE)
// ============================================================

export interface AttendanceTodayResponse {
  businessDate: string;
  currentStatus: string;
  membershipId: string;
  activeSession: AttendanceSession | null;
  completedSessions: AttendanceSession[];
  recentEvents: AttendanceEvent[];
  todayShift: Shift | null;
  policy: { timezone: string; autoCloseBreak: boolean };
}

export interface AttendanceSession {
  id: string;
  clockIn?: string;
  clockOut?: string;
  breakMinutes?: number;
  status: string;
}

export interface AttendanceEvent {
  type: string;
  effectiveAt: string;
}

export interface AttendanceActionResponse {
  recordId: string;
  status: string;
  effectiveAt: string;
  businessDate?: string;
  message: string;
}

export interface AttendanceCorrection {
  id: string;
  storeId: string;
  staffId?: string;
  staffName?: string;
  status: string;
  comment?: string;
}

export interface AdminTodayStaff {
  userId: string;
  staffId: string;
  staffName: string;
  staffPicture?: string;
  role: string;
  currentStatus: string;
  clockInAt?: string;
  clockOutAt?: string;
  breakMinutes?: number;
  shift?: Shift;
  sessions?: AttendanceSession[];
  checklist?: unknown;
}

export interface AdminMonthlySummary {
  userId: string;
  staffId: string;
  staffName: string;
  role: string;
  workDays: number;
  totalWorkMinutes: number;
  totalWorkHours: number;
  totalBreakMinutes: number;
  correctionCount: number;
  estimatedSalary?: number;
}

// ============================================================
// HACCP
// ============================================================

export interface HaccpTemplate {
  id: string;
  name: string;
  timing: string;
  scope?: string;
  description?: string;
  items?: HaccpItem[];
}

export interface HaccpItem {
  id: string;
  templateId: string;
  name: string;
  type: string;
  unit?: string;
  minValue?: number;
  maxValue?: number;
  options?: string[];
  displayOrder?: number;
}

// ============================================================
// LINE
// ============================================================

export interface LineLoginUrlResponse {
  url: string;
}

export interface LineLink {
  userId: string;
  staffName?: string;
  lineDisplayName?: string;
  linkedAt?: string;
}

// ============================================================
// Kiosk
// ============================================================

export interface KioskStaff {
  id: string;
  name: string;
  role: string;
  clockedIn: boolean;
  openRecordId?: string;
  clockInTime?: string;
}

// ============================================================
// Customer
// ============================================================

export interface Customer {
  id: string;
  store_id: string;
  name: string;
  name_kana: string | null;
  phone: string | null;
  phone_normalized: string | null;
  email: string | null;
  birthday: string | null;
  note: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CustomerListResponse {
  data: Customer[];
  total: number;
  limit: number;
  offset: number;
}

export interface CustomerDuplicateCheck {
  exists: boolean;
  customer: Customer | null;
}
