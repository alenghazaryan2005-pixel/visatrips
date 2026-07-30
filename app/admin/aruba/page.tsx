/**
 * /admin/aruba — same AdminPage as /admin, but the pathname triggers
 * server-side filtering to Aruba-only orders (see pathCountry inside
 * AdminPage). Kept as a thin re-export so both routes share one code
 * path — see app/admin/page.tsx for the actual implementation.
 */
export { default } from '../page';
