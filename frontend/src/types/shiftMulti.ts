// 複数店舗横断シフト管理の型定義

export interface MultiStoreShift {
  id: string;
  storeId: string;
  storeName: string;
  staffId: string;     // store_staff.id（店舗固有）
  userId: string;      // profiles.id（横断ID）
  userName: string;
  date: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  status: string;
  note?: string;
}

export interface MultiStoreRequest {
  id: string;
  storeId: string;
  storeName: string;
  staffId: string;
  userId: string;
  userName: string;
  date: string;
  requestType: string;
  startTime?: string;
  endTime?: string;
  note?: string;
}

export interface OrgStore {
  id: string;
  name: string;
}

export interface OrgEmployee {
  userId: string;
  name: string;
  stores: Array<{
    storeId: string;
    storeName: string;
    staffId: string;
    role: string;
  }>;
}

export interface ShiftConflict {
  userId: string;
  userName: string;
  date: string;
  shifts: Array<{
    storeId: string;
    storeName: string;
    startTime: string;
    endTime: string;
  }>;
  hasTimeOverlap: boolean;
}

export interface WeeklyResponse {
  stores: OrgStore[];
  shifts: MultiStoreShift[];
  requests: MultiStoreRequest[];
  startDate: string;
  endDate: string;
}

export interface SaveShiftResponse {
  shift: MultiStoreShift;
  conflicts: Array<{
    storeId: string;
    storeName: string;
    startTime: string;
    endTime: string;
  }>;
}
