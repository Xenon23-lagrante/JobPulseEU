import { and, eq } from "drizzle-orm";
import { db, jobNotificationsTable } from "@workspace/db";

export async function hasUserAlreadyReceivedJob(
  userId: number,
  jobId: number,
): Promise<boolean> {
  const [row] = await db
    .select()
    .from(jobNotificationsTable)
    .where(and(eq(jobNotificationsTable.userId, userId), eq(jobNotificationsTable.jobId, jobId)))
    .limit(1);

  return Boolean(row);
}

export async function recordJobNotification(
  userId: number,
  jobId: number,
  notificationType: string = "immediate",
): Promise<boolean> {
  if (await hasUserAlreadyReceivedJob(userId, jobId)) {
    return false;
  }

  const [notification] = await db
    .insert(jobNotificationsTable)
    .values({
      userId,
      jobId,
      notificationType,
    })
    .onConflictDoNothing({
      target: [jobNotificationsTable.userId, jobNotificationsTable.jobId],
    })
    .returning();

  return Boolean(notification);
}
