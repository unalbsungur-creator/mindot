import type { Metadata } from "next";
import { LegalPage } from "@/features/legal/components/LegalPage";
export const metadata: Metadata = { title: "Community Guidelines", alternates: { canonical: "/community-guidelines" } };
export default function GuidelinesPage() { return <LegalPage kind="guidelines" />; }
