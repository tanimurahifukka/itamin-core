/**
 * プラグインフックシステム
 *
 * プラグインが打刻フローに割り込むための汎用フック機構。
 * 各プラグインは pre_clock_in / pre_clock_out フックを登録できる。
 * フックが「未完了」を返す限り、打刻ボタンは非アクティブになる。
 */

export type HookTiming = 'pre_clock_in' | 'pre_clock_out';

export interface PluginHook {
  pluginName: string;
  timing: HookTiming;
  /** フックが完了しているかを返す。falseの間は打刻不可 */
  checkReady: (storeId: string) => Promise<boolean>;
  /** フック画面を表示するためのコンポーネントを返す */
  renderGate: (props: GateProps) => React.ReactNode;
}

export interface GateProps {
  storeId: string;
  staffId: string;
  onComplete: () => void;
}

// グローバルフックレジストリ
const hooks: PluginHook[] = [];

export function registerPluginHook(hook: PluginHook): void {
  hooks.push(hook);
  console.log(`[PluginHook] Registered: ${hook.pluginName} (${hook.timing})`);
}

export function getHooksForTiming(timing: HookTiming): PluginHook[] {
  return hooks.filter(h => h.timing === timing);
}
