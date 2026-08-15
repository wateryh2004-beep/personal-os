// Shared navigation helpers used by both the desktop sidebar and the mobile
// tab bar, so route-activation rules can never drift apart.
export function navActive(pathname: string, href: string) {
  return pathname === href || (href !== "/today" && pathname.startsWith(`${href}/`));
}
