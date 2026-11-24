import { cx } from "@/utils/cx";

/** BoardUI chart-card surface: soft grey panel, 2xl radius, no border. */
export function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return <section className={cx("min-w-0 rounded-2xl bg-background-secondary-default p-4", className)}>{children}</section>;
}

export function PanelHeader({ title, sub, action }: { title: React.ReactNode; sub?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h3 className="text-headline-medium text-text-primary">{title}</h3>
        {sub && <p className="text-body-regular text-text-secondary">{sub}</p>}
      </div>
      {action}
    </div>
  );
}
