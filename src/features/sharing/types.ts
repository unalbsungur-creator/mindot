export type ShareSubjectType = "note" | "memory";

/**
 * A share format is a reusable output size — the same registry philosophy
 * as `noteTemplates`/`frameTemplates`. Square and Story are the only two
 * for now (per the brief's explicit priority); add a format by adding an
 * entry, not by writing a new renderer.
 */
export interface ShareFormat {
  id: string;
  name: string;
  width: number;
  height: number;
  /**
   * Whether `ShareCardPicker` should offer this format as a user-facing
   * button. Defaults to `true` (Square/Story). The Memory Print master
   * format sets this `false`: measured at ~6-7s to render (see
   * shareFormats.ts), which is fine for an occasional, deliberate fetch
   * but not for a public "just try clicking every button" picker with no
   * loading-time expectation set — it stays reachable at
   * `/api/share/note/[messageId]/print` (the route is generic over any
   * registered format id) for a future, purpose-built download/purchase
   * flow instead.
   */
  showInPicker?: boolean;
}
