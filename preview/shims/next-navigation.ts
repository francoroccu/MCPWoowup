import { getRoute, navigate } from "../router";

export const useRouter = () => ({
  push: (href: string, opts?: { scroll?: boolean }) => navigate(href, opts),
  replace: (href: string, opts?: { scroll?: boolean }) => navigate(href, opts),
});
export const usePathname = () => getRoute().path;
export const useSearchParams = () => getRoute().query;

export class NotFoundError extends Error {}
export function notFound(): never {
  throw new NotFoundError("NOT_FOUND");
}
export function redirect(href: string): never {
  navigate(href);
  throw new NotFoundError("REDIRECT");
}
