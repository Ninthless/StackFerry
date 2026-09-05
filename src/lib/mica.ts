export function applyMicaDocument(enabled: boolean): void {
  document.documentElement.classList.toggle("mica", enabled)
}
