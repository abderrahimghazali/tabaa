export const TABS = ["all", "drafts", "unpaid", "overdue", "paid"] as const;
export type Tab = (typeof TABS)[number];
