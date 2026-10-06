import type { batchNotificationTable } from '../db/schema';
import type { Job } from './job';
import type { EmailDraft } from './outreach';
import type { Recruiter } from './recruiter';

export type BatchNotification = typeof batchNotificationTable.$inferSelect;

/** Saved details needed to review and act on one job in a batch email. */
export type NotificationJob = {
    job: Job;
    recruiter: Recruiter;
    draft: EmailDraft;
};

export type RenderedNotification = Pick<BatchNotification, 'subject' | 'htmlBody' | 'textBody'>;
