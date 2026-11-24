import { Card } from "@/components/app/layout";

export function Section({ id, title, description, children }: { id?: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card className="scroll-mt-24 p-5 sm:p-6">
      <section id={id} className="scroll-mt-24">
        <h2 className="text-headline-medium text-text-primary">{title}</h2>
        {description && <p className="mt-0.5 text-body-regular text-text-secondary">{description}</p>}
        <div className="mt-5 grid gap-4 sm:grid-cols-2">{children}</div>
      </section>
    </Card>
  );
}
