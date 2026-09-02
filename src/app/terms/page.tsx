import type { Metadata } from "next";
import { LegalPage } from "@/features/legal/components/LegalPage";
export const metadata: Metadata = { title: "Terms of Use", alternates: { canonical: "/terms" } };
export default function TermsPage() { return <LegalPage kind="terms" />; }
