import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { withinRateLimit } from "@/app/server/public-write";

export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (!pathname.startsWith("photos/") && !pathname.startsWith("thumbnails/")) throw new Error("Invalid upload path");
        if (!await withinRateLimit(request, "uploads", clientPayload ?? undefined, 20)) throw new Error("Too many uploads");
        return {
          allowedContentTypes: ["image/jpeg"],
          maximumSizeInBytes: 10 * 1024 * 1024,
          addRandomSuffix: false,
          allowOverwrite: true,
        };
      },
      onUploadCompleted: async () => {},
    });
    return Response.json(response);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 400 },
    );
  }
}
