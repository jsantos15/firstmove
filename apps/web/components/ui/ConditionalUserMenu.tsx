'use client';

import { usePathname } from 'next/navigation';
import { UserMenu } from './UserMenu';

/**
 * Renders UserMenu everywhere except practice pages (/openings/[id]),
 * which have their own UserMenu placed directly in the page header.
 */
export function ConditionalUserMenu() {
  const pathname = usePathname();
  if (/^\/openings\/.+/.test(pathname)) return null;
  return <UserMenu />;
}
