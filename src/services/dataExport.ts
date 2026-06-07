import { db } from '@/services/db';

type BackupPayload = {
  version: number;
  exportedAt: string;
  profile: Awaited<ReturnType<typeof db.profile.toArray>>;
  workoutSessions: Awaited<ReturnType<typeof db.workoutSessions.toArray>>;
  exerciseTargets: Awaited<ReturnType<typeof db.exerciseTargets.toArray>>;
  aiReviews: Awaited<ReturnType<typeof db.aiReviews.toArray>>;
  prRecords: Awaited<ReturnType<typeof db.prRecords.toArray>>;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export const exportAllData = async (): Promise<void> => {
  const data: BackupPayload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    profile: await db.profile.toArray(),
    workoutSessions: await db.workoutSessions.toArray(),
    exerciseTargets: await db.exerciseTargets.toArray(),
    aiReviews: await db.aiReviews.toArray(),
    prRecords: await db.prRecords.toArray(),
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `coaich-backup-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

export const importAllData = async (file: File): Promise<void> => {
  const text = await file.text();
  const parsed: unknown = JSON.parse(text);

  if (!isObject(parsed)) {
    throw new Error('Invalid backup file.');
  }

  const {
    profile,
    workoutSessions,
    exerciseTargets,
    aiReviews,
    prRecords,
  } = parsed as Partial<BackupPayload>;

  await db.transaction('rw', [db.profile, db.workoutSessions, db.exerciseTargets, db.aiReviews, db.prRecords], async () => {
    const hasExistingProfile = (await db.profile.count()) > 0;
    if (!hasExistingProfile && Array.isArray(profile) && profile.length > 0) {
      await db.profile.bulkPut(profile);
    }
    if (Array.isArray(workoutSessions) && workoutSessions.length > 0) {
      await db.workoutSessions.bulkPut(workoutSessions);
    }
    if (Array.isArray(exerciseTargets) && exerciseTargets.length > 0) {
      await db.exerciseTargets.bulkPut(exerciseTargets);
    }
    if (Array.isArray(aiReviews) && aiReviews.length > 0) {
      await db.aiReviews.bulkPut(aiReviews);
    }
    if (Array.isArray(prRecords) && prRecords.length > 0) {
      await db.prRecords.bulkPut(prRecords);
    }
  });
};
