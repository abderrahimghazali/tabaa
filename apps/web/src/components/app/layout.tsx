import { cx } from "@/utils/cx";

export function PageHeader({ title, subtitle, badge, className }: { title: React.ReactNode; subtitle?: React.ReactNode; badge?: React.ReactNode; className?: string }) {
  return (
    <header className={cx("mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 nav:mb-6", className)}>
      <h1 className="text-title-1-medium text-text-primary wrap-break-word">{title}</h1>
      {badge}
      {subtitle && <p className="basis-full text-body-regular text-text-secondary">{subtitle}</p>}
    </header>
  );
}

/** BoardUI card: hairline border on the primary surface. */
export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cx("rounded-3xl border border-border-button-default bg-background-primary-default", className)}>{children}</div>;
}

/** Soft grey well that holds cards, as in BoardUI's dashboard previews. */
export function Tray({ className, children }: { className?: string; children: React.ReactNode }) {
  return <section className={cx("rounded-3xl bg-background-secondary-default p-2", className)}>{children}</section>;
}
