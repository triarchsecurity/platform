import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { bugReports, workflowTransitions } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(req: NextRequest) {
  // Slack sends interactive payloads as URL-encoded form data
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

  const bugId = action.value;
  const actionId = action.action_id;
  const userName = payload.user?.name ?? 'slack-user';

  const [bug] = await db.select().from(bugReports).where(eq(bugReports.id, bugId));
  if (!bug) {
    return NextResponse.json({ text: 'Bug report not found' });
  }

  let newStatus: string;
  if (actionId === 'approve_fix') {
    newStatus = 'approved';
  } else if (actionId === 'defer_fix') {
    newStatus = 'deferred';
  } else {
    return NextResponse.json({ text: 'Unknown action' });
  }

  await db.update(bugReports)
    .set({ status: newStatus, updatedAt: new Date() })
    .where(eq(bugReports.id, bugId));

  await db.insert(workflowTransitions).values({
    entityType: 'bug_report',
    entityId: bugId,
    fromStatus: bug.status,
    toStatus: newStatus,
    transitionedBy: `slack:${userName}`,
  });

  const responseText = actionId === 'approve_fix'
    ? `:white_check_mark: *${userName}* approved fix for "${bug.title}"`
    : `:hourglass: *${userName}* deferred "${bug.title}" to next build`;

  return NextResponse.json({
    response_type: 'in_channel',
    replace_original: false,
    text: responseText,
  });
}
