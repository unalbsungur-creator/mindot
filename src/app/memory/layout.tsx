import type { Metadata } from "next";
// Memory routes may resolve public notes, but the page also contains private
// owner project state. Public discovery belongs to /board and /u instead.
export const metadata: Metadata = { robots: { index: false, follow: false } };
export default function MemoryLayout({ children }: { children: React.ReactNode }) { return children; }
