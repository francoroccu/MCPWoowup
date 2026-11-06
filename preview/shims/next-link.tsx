import type { AnchorHTMLAttributes, ReactNode } from "react";
import { navigate } from "../router";

type Props = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children?: ReactNode; scroll?: boolean };

export default function Link({ href, children, onClick, scroll, ...rest }: Props) {
  return (
    <a
      href="#"
      {...rest}
      onClick={(e) => {
        onClick?.(e);
        e.preventDefault();
        navigate(href, { scroll });
      }}
    >
      {children}
    </a>
  );
}
