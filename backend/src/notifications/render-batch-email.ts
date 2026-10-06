import type { NotificationJob, RenderedNotification } from '../types/notification';

function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character] ?? character);
}

function httpUrl(value: string): string | null {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
    } catch {
        return null;
    }
}

function link(label: string, url: string): string {
    const href = httpUrl(url);
    return href
        ? `<a href="${escapeHtml(href)}" style="color:#3156cf;text-decoration:underline">${escapeHtml(label)}</a>`
        : escapeHtml(label);
}

/** Renders the simple Markdown links used by saved outreach without allowing HTML from job data. */
function formatText(value: string): string {
    const markdownLink = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
    let formatted = '';
    let position = 0;
    for (const match of value.matchAll(markdownLink)) {
        const index = match.index ?? position;
        formatted += escapeHtml(value.slice(position, index)).replace(/\r?\n/g, '<br>');
        formatted += link(match[1], match[2]);
        position = index + match[0].length;
    }
    return formatted + escapeHtml(value.slice(position)).replace(/\r?\n/g, '<br>');
}

function dateLabel(value: Date | null): string {
    return value
        ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'America/New_York' }).format(value)
        : 'Unknown';
}

function renderJobCard({ job, recruiter, draft }: NotificationJob, position: number): string {
    const title = job.title ?? 'Untitled role';
    const company = job.companyName ?? 'Unknown company';
    const draftSubject = draft.revisedSubject ?? draft.originalSubject;
    const draftBody = draft.revisedDraft ?? draft.originalDraft;
    const sources = [...new Set([...recruiter.sources, ...draft.sources])].filter(httpUrl);
    const assessment = job.assessmentDetails;
    const applicationUrl = job.applyUrl ?? job.sourceUrl;

    return `<tr><td style="padding:0 24px 20px">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#ffffff;border:1px solid #e5e7ef;border-radius:12px">
        <tr><td style="padding:24px;font-family:Arial,sans-serif;color:#202638">
          <div style="font-size:12px;font-weight:700;letter-spacing:1px;color:#65718c">JOB ${position}</div>
          <h2 style="font-size:21px;line-height:1.3;margin:9px 0 4px">${escapeHtml(title)}</h2>
          <div style="font-size:16px;color:#4f5e7a">${escapeHtml(company)}</div>
          <p style="font-size:13px;line-height:1.6;color:#5e6980;margin:16px 0">
            ${escapeHtml(job.location ?? 'Location unknown')} &nbsp;·&nbsp;
            Base salary: ${escapeHtml(job.salaryText ?? 'unknown')} &nbsp;·&nbsp;
            Posted: ${escapeHtml(dateLabel(job.postedAt))}
          </p>
          ${assessment ? `<p style="font-size:13px;line-height:1.6;color:#374562;margin:0 0 16px">
            Match: ${escapeHtml(assessment.matchStrength)} &nbsp;·&nbsp;
            Location: ${escapeHtml(assessment.locationFit)} &nbsp;·&nbsp;
            Compensation: ${escapeHtml(assessment.compensation)} &nbsp;·&nbsp;
            Work authorization: ${escapeHtml(assessment.workAuthorization)}
          </p>` : ''}
          <p style="font-size:14px;margin:0 0 22px">${link('Open application ↗', applicationUrl)}</p>
          <div style="border-top:1px solid #e9ebf1;padding-top:18px">
            <div style="font-size:12px;font-weight:700;letter-spacing:1px;color:#65718c">RECRUITER</div>
            <p style="font-size:14px;line-height:1.6;margin:8px 0 4px">
              ${escapeHtml(recruiter.name)} · ${escapeHtml(recruiter.title)}<br>
              ${escapeHtml(recruiter.email)}${recruiter.linkedinUrl ? `<br>${link('LinkedIn profile', recruiter.linkedinUrl)}` : ''}
            </p>
            ${recruiter.reason ? `<p style="font-size:13px;line-height:1.5;color:#5e6980;margin:8px 0">Why this recruiter: ${formatText(recruiter.reason)}</p>` : ''}
          </div>
          <div style="border-top:1px solid #e9ebf1;padding-top:18px;margin-top:18px">
            <div style="font-size:12px;font-weight:700;letter-spacing:1px;color:#65718c">DRAFT TO REVIEW</div>
            <p style="font-size:14px;margin:8px 0">Subject: ${escapeHtml(draftSubject)}</p>
            <div style="font-size:14px;line-height:1.6;background:#f6f7fb;border-radius:8px;padding:16px;overflow-wrap:anywhere">${formatText(draftBody)}</div>
            <p style="font-size:13px;line-height:1.5;color:#5e6980;margin:16px 0 0">Hook or fallback: ${formatText(draft.reason)}</p>
            ${sources.length ? `<p style="font-size:13px;line-height:1.6;color:#5e6980;margin:10px 0 0">Sources: ${sources.map((source, index) => link(String(index + 1), source)).join(' · ')}</p>` : ''}
          </div>
        </td></tr>
      </table>
    </td></tr>`;
}

function renderJobText({ job, recruiter, draft }: NotificationJob, position: number): string {
    const assessment = job.assessmentDetails;
    const sources = [...new Set([...recruiter.sources, ...draft.sources])];
    return [
        `${position}. ${job.title ?? 'Untitled role'} · ${job.companyName ?? 'Unknown company'}`,
        `Location: ${job.location ?? 'unknown'} | Base salary: ${job.salaryText ?? 'unknown'} | Posted: ${dateLabel(job.postedAt)}`,
        assessment ? `Match: ${assessment.matchStrength} | Location: ${assessment.locationFit} | Compensation: ${assessment.compensation} | Work authorization: ${assessment.workAuthorization}` : '',
        `Apply: ${job.applyUrl ?? job.sourceUrl}`,
        `Recruiter: ${recruiter.name}, ${recruiter.title} <${recruiter.email}>`,
        recruiter.linkedinUrl ? `LinkedIn: ${recruiter.linkedinUrl}` : '',
        recruiter.reason ? `Why this recruiter: ${recruiter.reason}` : '',
        `Draft subject: ${draft.revisedSubject ?? draft.originalSubject}`,
        'Draft body:',
        draft.revisedDraft ?? draft.originalDraft,
        `Hook or fallback: ${draft.reason}`,
        sources.length ? `Sources: ${sources.join(', ')}` : '',
    ].filter(Boolean).join('\n');
}

/** Renders one review email containing every prepared job in the batch. */
export function renderBatchEmail(jobs: NotificationJob[]): RenderedNotification {
    const subject = `${jobs.length} jobs ready to review · Sapply`;
    const htmlBody = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
      <body style="margin:0;background:#f6f7fb">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f6f7fb"><tr><td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:680px">
          <tr><td style="padding:28px 24px 12px;font-family:Arial,sans-serif">
            <div style="font-size:13px;font-weight:700;letter-spacing:2px;color:#3156cf">SAPPLY</div>
            <h1 style="font-size:28px;line-height:1.2;margin:12px 0 8px;color:#202638">${jobs.length} jobs ready to review</h1>
            <p style="font-size:14px;line-height:1.5;color:#5e6980;margin:0 0 12px">Review each application and recruiter draft before sending anything.</p>
          </td></tr>
          ${jobs.map((job, index) => renderJobCard(job, index + 1)).join('')}
          <tr><td style="padding:0 24px 28px;font:12px Arial,sans-serif;color:#778198">Prepared by Sapply · Applications and recruiter messages are yours to send.</td></tr>
        </table>
      </td></tr></table></body></html>`;
    const textBody = [
        `${jobs.length} jobs ready to review`,
        'Review each application and recruiter draft before sending anything.',
        ...jobs.map((job, index) => renderJobText(job, index + 1)),
    ].join('\n\n---\n\n');
    return { subject, htmlBody, textBody };
}
