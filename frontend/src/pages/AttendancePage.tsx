/**
 * 勤怠ページ（unified attendance plugin のエントリーポイント）
 *
 * 鉄則1「1 Plugin = 1 Function」に従い、勤怠ドメインの UI は
 * この1コンポーネントに集約する。ロールに応じて
 *   - 管理者系（owner / manager）: AttendanceAdminPage（今日の出勤ボード・月次・修正承認・ポリシー）
 *   - スタッフ系（leader / full_time / part_time）: AttendanceStaffPage（打刻・履歴・修正申請）
 * を切り替える。
 */
import { useAuth } from '../contexts/AuthContext';
import AttendanceAdminPage from './AttendanceAdminPage';
import AttendanceStaffPage from './AttendanceStaffPage';

export default function AttendancePage() {
  const { selectedStore } = useAuth();
  const role = selectedStore?.role;
  const isAdmin = role === 'owner' || role === 'manager';

  if (isAdmin) {
    return <AttendanceAdminPage />;
  }
  return <AttendanceStaffPage />;
}
