import clsx, { type ClassValue } from 'clsx';

/**
 * Tailwind クラス名を条件付きで合成するユーティリティ。
 * 各 Atom/Molecule で className prop とデフォルトクラスをマージするために使う。
 */
export const cn = (...args: ClassValue[]): string => clsx(args);
