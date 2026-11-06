/** Router en memoria para la vista previa (reemplaza el enrutado de Next.js). */
type Listener = () => void;

let current = { path: "/", query: new URLSearchParams() };
const listeners = new Set<Listener>();

export function getRoute() {
  return current;
}

export function navigate(href: string, opts: { scroll?: boolean } = {}) {
  const [path, qs = ""] = href.split("?");
  const samePath = path === current.path;
  current = { path: path || "/", query: new URLSearchParams(qs) };
  listeners.forEach((l) => l());
  if (opts.scroll !== false && !samePath) window.scrollTo({ top: 0 });
}

export function subscribe(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}
