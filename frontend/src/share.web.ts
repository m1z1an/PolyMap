export async function share(path: string) {
  const link = new URL(path, location.origin).href;
  if (navigator.clipboard) {
    try { await navigator.clipboard.writeText(link); return true; } catch { /* show selectable link */ }
  }
  return false;
}
