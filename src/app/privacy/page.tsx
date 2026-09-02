import type { Metadata } from "next";
import { LegalPage } from "@/features/legal/components/LegalPage";
export const metadata: Metadata = { title: "Privacy Policy", alternates: { canonical: "/privacy" } };
export default function PrivacyPage() { return <LegalPage kind="privacy" />; }
