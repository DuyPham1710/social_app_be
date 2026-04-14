/**
 * So sánh hai mã ngôn ngữ (BCP-47 / ISO): coi là cùng ngôn ngữ giao diện
 * nếu cùng mã ngôn ngữ gốc (ví dụ en và en-US).
 */
export function langsMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  const primary = (s: string) =>
    s
      .toLowerCase()
      .trim()
      .replace(/_/g, '-')
      .split('-')[0];
  return primary(a) === primary(b);
}
