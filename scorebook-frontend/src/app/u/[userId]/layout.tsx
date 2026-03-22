/**
 * Public profile URLs are always dynamic (UUID/slug). This avoids Next dev’s
 * static-paths worker loading incomplete framer-motion vendor chunks (MODULE_NOT_FOUND).
 */
export const dynamic = "force-dynamic";

export default function PublicProfileLayout({ children }: { children: React.ReactNode }) {
  return children;
}
