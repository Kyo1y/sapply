export type GreenhouseJobCard = {
    id: number;
    title: string;
};

export type GreenhouseJob = {
    id: number;
    internal_job_id: number | null;
    title: string;
    company_name: string;
    location: { name: string };
    content: string;
    absolute_url: string;
    language: string;
    updated_at: string;
    first_published?: string;
    application_deadline?: string;
    requisition_id?: string;
    metadata?: Array<{
        id: number;
        name: string;
        value_type: string;
        value: unknown;
    }> | null;
    pay_input_ranges?: Array<{
        min_cents: number;
        max_cents: number;
        currency_type: string;
        title: string;
        blurb: string;
    }>;
};