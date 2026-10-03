import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getRecruitersAutumn } from './autumn-client';

const context = {
    jobId: 'job-1',
    companyName: 'TikTok',
    jobTitle: 'Software Engineer Graduate',
    jobLocation: 'San Jose, CA',
    jobUrl: 'https://careers.example.com/jobs/1',
};

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });
}

describe('getRecruitersAutumn', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('waits through running and queued states before returning recruiters', async () => {
        const fetcher = vi.fn<typeof fetch>()
            .mockResolvedValueOnce(jsonResponse({ task_id: 'task-1', poll_after_s: 8 }))
            .mockResolvedValueOnce(jsonResponse({ active: true, status: 'execute' }))
            .mockResolvedValueOnce(jsonResponse({
                active: false, status: 'accepted', pending_op: 'execute',
            }))
            .mockResolvedValueOnce(jsonResponse({ active: false, status: 'plan' }))
            .mockResolvedValueOnce(jsonResponse({
                total: 3,
                rows: [
                    {
                        name: 'Ava Recruiter', title: 'Early Careers Recruiter',
                        email: 'ava@example.com',
                        linkedin_url: 'https://www.linkedin.com/in/ava',
                    },
                    {
                        name: 'No Email', title: 'Technical Recruiter', email: null,
                    },
                    {
                        name: 'Sam Recruiter', title: 'Talent Partner',
                        email: 'sam@example.com', linkedin_url: null,
                    },
                ],
            }));

        const result = getRecruitersAutumn(context, 'test-key', fetcher);
        await vi.advanceTimersByTimeAsync(16_000);
        expect(fetcher).toHaveBeenCalledTimes(3);
        await vi.advanceTimersByTimeAsync(8_000);
        await expect(result).resolves.toEqual([
            {
                name: 'Ava Recruiter', title: 'Early Careers Recruiter',
                email: 'ava@example.com', linkedinUrl: 'https://www.linkedin.com/in/ava',
            },
            {
                name: 'Sam Recruiter', title: 'Talent Partner',
                email: 'sam@example.com', linkedinUrl: null,
            },
        ]);
        expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
            'https://api.autumn.ai/task/start',
            'https://api.autumn.ai/task/task-1/state',
            'https://api.autumn.ai/task/task-1/state',
            'https://api.autumn.ai/task/task-1/state',
            'https://api.autumn.ai/task/task-1/output?limit=20',
        ]);
    });

    it('throws when Autumn reports a failed task without fetching output', async () => {
        const fetcher = vi.fn<typeof fetch>()
            .mockResolvedValueOnce(jsonResponse({ task_id: 'task-1' }))
            .mockResolvedValueOnce(jsonResponse({
                active: false, status: 'plan', last_submit_error: 'out_of_credits',
            }));

        const assertion = expect(getRecruitersAutumn(context, 'key', fetcher))
            .rejects.toThrow('Autumn task task-1 failed: out_of_credits');
        await vi.advanceTimersByTimeAsync(5_000);
        await assertion;
        expect(fetcher).toHaveBeenCalledTimes(2);
    });

    it('stops polling after fifteen minutes and includes the task ID', async () => {
        const fetcher = vi.fn<typeof fetch>()
            .mockResolvedValueOnce(jsonResponse({ task_id: 'task-1' }))
            .mockImplementation(async () => jsonResponse({ active: true, status: 'execute' }));

        const assertion = expect(getRecruitersAutumn(context, 'key', fetcher))
            .rejects.toThrow('Autumn recruiter search timed out for task task-1');
        await vi.advanceTimersByTimeAsync(15 * 60 * 1_000);
        await assertion;
        expect(fetcher.mock.calls.some(([url]) => String(url).includes('/output'))).toBe(false);
    });
});
