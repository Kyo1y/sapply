import { z } from 'zod';
import { buildAutumnRecruiterInstructions } from '../../instructions/autumn-instructions';
import type {
    RecruiterCandidate,
    RecruiterSearchContext,
} from '../../types/recruiter';

const AUTUMN_API_ROOT = 'https://api.autumn.ai';
const RECRUITER_LIMIT = 20;
const SEARCH_TIMEOUT_MS = 15 * 60 * 1_000;

const startedTaskSchema = z.looseObject({
    task_id: z.string().min(1),
    poll_after_s: z.number().int().positive().nullish(),
});

const taskStateSchema = z.looseObject({
    active: z.boolean(),
    status: z.string(),
    pending_op: z.string().nullish(),
    last_submit_error: z.string().nullish(),
});

const outputSchema = z.looseObject({
    rows: z.array(z.unknown()),
});

const recruiterRowSchema = z.looseObject({
    name: z.string().trim().min(1),
    title: z.string().trim().min(1),
    email: z.string().trim().email().nullish(),
    linkedin_url: z.string().trim().url().nullish(),
});

async function autumnJson(
    url: string,
    init: RequestInit,
    fetcher: typeof fetch,
): Promise<unknown> {
    const response = await fetcher(url, init);
    const body: unknown = await response.json();
    if (response.ok) return body;

    const error = z.looseObject({ message: z.string().optional() }).safeParse(body);
    const detail = error.success && error.data.message
        ? `: ${error.data.message}`
        : '';
    throw new Error(`Autumn returned HTTP ${response.status}${detail}`);
}

function recruiterTask(context: RecruiterSearchContext): object {
    return {
        version: 'scout',
        source_data: { job_id: context.jobId },
        task: {
            ...buildAutumnRecruiterInstructions(context, RECRUITER_LIMIT),
            output: {
                id: 'job-recruiters',
                kind: 'research',
                path: 'outputs/job-recruiters.jsonl',
                schema: {
                    name: { type: 'name', description: 'Recruiter name' },
                    title: { type: 'str', description: 'Current title at the hiring company' },
                    email: { type: 'str', description: 'Work email address' },
                    linkedin_url: { type: 'url', description: 'LinkedIn profile URL' },
                },
                schema_order: ['name', 'title', 'email', 'linkedin_url'],
                target_count: RECRUITER_LIMIT,
            },
            questions: [],
        },
    };
}

/** Polls a started task until Autumn finishes, fails, or the deadline expires. */
async function waitForAutumnTask(
    task: z.infer<typeof startedTaskSchema>,
    options: {
        headers: HeadersInit;
        signal: AbortSignal;
        deadline: number;
        fetcher: typeof fetch;
    },
): Promise<void> {
    const { headers, signal, deadline, fetcher } = options;
    const taskUrl = `${AUTUMN_API_ROOT}/task/${encodeURIComponent(task.task_id)}`;
    const pollIntervalMs = (task.poll_after_s ?? 5) * 1_000;

    while (true) {
        const remainingMs = deadline - Date.now();
        if (remainingMs <= 0) {
            throw new Error(`Autumn recruiter search timed out for task ${task.task_id}`);
        }
        await new Promise<void>((resolve) => {
            setTimeout(resolve, Math.min(pollIntervalMs, remainingMs));
        });
        if (Date.now() >= deadline) {
            throw new Error(`Autumn recruiter search timed out for task ${task.task_id}`);
        }
        const state = taskStateSchema.parse(await autumnJson(
            `${taskUrl}/state`,
            { headers, signal },
            fetcher,
        ));
        if (state.last_submit_error) {
            throw new Error(`Autumn task ${task.task_id} failed: ${state.last_submit_error}`);
        }
        if (state.status === 'deleted') {
            throw new Error(`Autumn task ${task.task_id} was deleted`);
        }
        if (!state.active && !state.pending_op) break;
    }
}

/** Starts an Autumn search, waits for completion, and returns contactable recruiters. */
export async function getRecruitersAutumn(
    context: RecruiterSearchContext,
    apiKey: string,
    fetcher: typeof fetch = fetch,
): Promise<RecruiterCandidate[]> {
    if (!apiKey.trim()) throw new Error('AUTUMN_API_KEY is required');
    const headers = {
        accept: 'application/json',
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
    };
    const deadline = Date.now() + SEARCH_TIMEOUT_MS;
    const signal = AbortSignal.timeout(SEARCH_TIMEOUT_MS);
    const body = await autumnJson(
        `${AUTUMN_API_ROOT}/task/start`,
        {
            method: 'POST',
            headers,
            signal,
            body: JSON.stringify(recruiterTask(context)),
        },
        fetcher,
    );
    const task = startedTaskSchema.parse(body);
    await waitForAutumnTask(task, { headers, signal, deadline, fetcher });

    const taskUrl = `${AUTUMN_API_ROOT}/task/${encodeURIComponent(task.task_id)}`;
    const output = outputSchema.parse(await autumnJson(
        `${taskUrl}/output?limit=${RECRUITER_LIMIT}`,
        { headers, signal },
        fetcher,
    ));
    const recruiters: RecruiterCandidate[] = [];

    for (const value of output.rows) {
        const row = recruiterRowSchema.parse(value);
        if (!row.email) continue;
        recruiters.push({
            name: row.name,
            title: row.title,
            email: row.email,
            linkedinUrl: row.linkedin_url ?? null,
        });
    }
    return recruiters;
}
