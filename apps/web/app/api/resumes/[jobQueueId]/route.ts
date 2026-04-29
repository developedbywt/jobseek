import { type NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { db } from "@/db";
import { jobQueue } from "@/db/schema";
import { getSessionUserId } from "@/lib/sessionCache";

function getR2Client(): S3Client {
  const endpoint = process.env.R2_ENDPOINT_URL;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 credentials not configured");
  }
  return new S3Client({
    endpoint,
    region: "auto",
    credentials: { accessKeyId, secretAccessKey },
  });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobQueueId: string }> },
) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { jobQueueId } = await params;

  const [item] = await db
    .select({ customizedR2Key: jobQueue.customizedR2Key })
    .from(jobQueue)
    .where(and(eq(jobQueue.id, jobQueueId), eq(jobQueue.userId, userId)))
    .limit(1);

  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!item.customizedR2Key) {
    return NextResponse.json(
      { error: "No customized resume for this job" },
      { status: 404 },
    );
  }

  const bucket = process.env.R2_BUCKET;
  if (!bucket) {
    return NextResponse.json(
      { error: "Storage not configured" },
      { status: 500 },
    );
  }

  try {
    const r2 = getR2Client();
    const obj = await r2.send(
      new GetObjectCommand({ Bucket: bucket, Key: item.customizedR2Key }),
    );

    const body = obj.Body;
    if (!body) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const bytes = await body.transformToByteArray();

    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "text/x-tex",
        "Content-Disposition": `attachment; filename="resume-customized.tex"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to retrieve file" },
      { status: 500 },
    );
  }
}
