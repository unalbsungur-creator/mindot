"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useLocale } from "@/i18n/LocaleProvider";

/** `path` is a site-relative path (e.g. "/u/ab12cd34ef") — resolved against the current origin at click time, so the copied link is always correct for whatever host is actually serving the page. */
export function CopyLinkButton({ path }: { path: string }) {
  const { dictionary } = useLocale();
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    const url = typeof window !== "undefined" ? `${window.location.origin}${path}` : path;
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleCopy}>
      {copied ? dictionary.profile.copied : dictionary.profile.copyLinkButton}
    </Button>
  );
}
