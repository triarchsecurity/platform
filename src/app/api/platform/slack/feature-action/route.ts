import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { featureRequests, workflowTransitions } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const payloadStr = formData.get('payload') as string;
  if (!payloadStr) {
    return NextResponse.json({ error: 'No payload' }, { status: 400 });
  }

  const payload = JSON.parse(payloadStr);
  const action = payload.actions?.[0];
  if (!action) {
    return NextResponse.json({ error: 'No action' }, { status: 400 });
  }

  const featureId = action.value;
  const actionId = action.action_id;
  const userName = payload.user?.name ?? 'slack-user';

  const [feature] = await db.select().from(featureRequests).where(eq(featureRequests.id, featureId));
  if (!feature) {
    return NextResponse.json({ text: 'Feature request not found' });
  }

  let newStatus: string;
  if (actionId === 'approve_feature') {
    newStatus = 'approved';
  } else if (actionId === 'discuss_feature') {
    newStatus = 'reviewed';
  } else if (actionId === 'decline_feature') {
    newStatus = 'declined';
  } else {
    return NextResponse.json({ text: 'Unknown action' });
  }

  await db.update(featureRequests)
    .set({ status: newStatus, updatedAt: new Date() })
    .where(eq(featureRequests.id, featureId));

  await db.insert(workflowTransitions).values({
    entityType: 'feature_request',
    entityId: featureId,
    fromStatus: feature.status,
    toStatus: newStatus,
    transitionedBy: `slack:${userName}`,
  });

  const emoji = actionId === 'approve_feature' ? ':white_check_mark:' : actionId === 'decline_feature' ? ':x:' : ':speech_balloon:';
  const verb = actionId === 'approve_feature' ? 'approved' : actionId === 'decline_feature' ? 'declined' : 'flagged for discussion';

  return NextResponse.json({
    response_type: 'in_channel',
    replace_original: false,
    text: `${emoji} *${userName}* ${verb} "${feature.title}"`,
  });
}
