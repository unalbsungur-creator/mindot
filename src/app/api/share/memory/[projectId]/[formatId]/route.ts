import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/features/auth/auth";
import { getPublicMessageById } from "@/features/board/repository";
import { getFrameTemplate } from "@/features/memories/config/frameTemplates";
import { resolveCaptureRegion } from "@/features/memories/lib/captureRegion";
import { digitalAccessCodeRepository, memoryRepository } from "@/features/memories/repository";
import { getShareFormat } from "@/features/sharing/config/shareFormats";
import { sloganForLanguage, toShareCardNote } from "@/features/sharing/lib/shareCardData";
import { renderShareCard } from "@/features/sharing/services/shareCardRenderer";

export const runtime = "nodejs";

/**
 * Generates a branded share-card PNG for one of the caller's own Memory
 * Projects. Authorization mirrors the PDF download route
 * (app/api/memories/[projectId]/download/route.ts): must be signed in,
 * must own the project, and a digital_frame project additionally requires
 * a redeemed access code for THIS project. Deliberately no admin bypass —
 * sharing is a personal action on your own memory, not an operational
 * one, so it stays stricter than the admin PDF preview.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ projectId: string; formatId: string }> }) {
  const { projectId, formatId } = await context.params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "auth-required" }, { status: 401 });
  }

  const project = await memoryRepository.getById(projectId);
  if (!project) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }
  if (project.createdBy !== session.user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (project.outputType === "digital_frame") {
    const hasAccess = await digitalAccessCodeRepository.hasRedeemedCodeForProject(project.id);
    if (!hasAccess) {
      return NextResponse.json({ error: "access-not-redeemed" }, { status: 403 });
    }
  }

  const message = await getPublicMessageById(project.messageId);
  if (!message) {
    return NextResponse.json({ error: "source-unavailable" }, { status: 410 });
  }

  const region = await resolveCaptureRegion(message, project.captureMode);
  const format = getShareFormat(formatId);
  const frame = project.frameTemplateId ? getFrameTemplate(project.frameTemplateId) : null;

  const image = renderShareCard({
    primary: toShareCardNote(region.primary),
    surrounding: region.surrounding.map(toShareCardNote),
    format,
    frame,
    slogan: sloganForLanguage(message.language),
  });

  image.headers.set("Cache-Control", "private, no-store");
  return image;
}
