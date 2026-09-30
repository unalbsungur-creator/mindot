import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/features/auth/auth";
import { getPublicMessageById } from "@/features/board/repository";
import { getFrameTemplate } from "@/features/memories/config/frameTemplates";
import { resolveCaptureRegion } from "@/features/memories/lib/captureRegion";
import { memoryRepository } from "@/features/memories/repository";
import { checkMemoryOutputAccess } from "@/features/memories/services/outputAccess";
import { getPublicShareFormat } from "@/features/sharing/config/shareFormats";
import { sloganForLanguage, toShareCardNote } from "@/features/sharing/lib/shareCardData";
import { renderShareCard } from "@/features/sharing/services/shareCardRenderer";

export const runtime = "nodejs";

/**
 * Generates a branded share-card PNG for one of the caller's own Memory
 * Projects. Authorization is the same shared output policy the PDF
 * download route uses (features/memories/lib/outputPolicy.ts, purpose
 * "share"): must be signed in, must own the project, and must hold the
 * entitlement its outputType and frame require — a redeemed access code
 * for a digital_frame, the PDF unlock for a framed personal_pdf, and never
 * for a framed physical_gift or an unknown type. Deliberately no admin bypass —
 * sharing is a personal action on your own memory, not an operational
 * one, so it stays stricter than the admin PDF preview.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ projectId: string; formatId: string }> }) {
  const { projectId, formatId } = await context.params;
  // Internal-only formats (the paid Memory PDF's print master) are never
  // generated here — checked before any lookup, not just hidden in the UI.
  const format = getPublicShareFormat(formatId);
  if (!format) {
    return NextResponse.json({ error: "format-not-available" }, { status: 404 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "auth-required" }, { status: 401 });
  }

  const project = await memoryRepository.getById(projectId);
  if (!project) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }
  const access = await checkMemoryOutputAccess(project, session.user, "share", { adminBypass: false });
  if (!access.allowed) {
    return NextResponse.json({ error: access.reason }, { status: 403 });
  }

  const message = await getPublicMessageById(project.messageId);
  if (!message) {
    return NextResponse.json({ error: "source-unavailable" }, { status: 410 });
  }

  const region = await resolveCaptureRegion(message, project.captureMode);
  const frame = project.frameTemplateId ? getFrameTemplate(project.frameTemplateId) : null;

  let image;
  try {
    image = await renderShareCard({
      primary: toShareCardNote(region.primary),
      surrounding: region.surrounding.map(toShareCardNote),
      format,
      frame,
      slogan: sloganForLanguage(message.language),
    });
  } catch (error) {
    console.error("renderShareCard failed", { formatId, error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "render-failed" }, { status: 500 });
  }

  image.headers.set("Cache-Control", "private, no-store");
  return image;
}
