import type { Metadata } from "next";
import { AboutPageContent } from "./_components/AboutPageContent";

export const metadata: Metadata = { title: "About", alternates: { canonical: "/about" } };

export default function AboutPage() {
  return <AboutPageContent />;
}
