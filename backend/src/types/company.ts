import {
    companiesTable,
    companySourcesTable,
} from '../db/schema';

export type Company = typeof companiesTable.$inferSelect;
export type CompanySource = typeof companySourcesTable.$inferSelect;
export type CompanySourceProvider = CompanySource['provider'];

export type DetectedCompanySource = Pick<
    CompanySource,
    'provider' | 'externalKey' | 'sourceUrl'
>;
