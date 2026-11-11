interface PageHeadingProps {
  eyebrow: string;
  title: string;
  description: string;
}

export function PageHeading({ eyebrow, title, description }: PageHeadingProps) {
  return (
    <header className="mb-8 break-keep">
      <p className="mb-3 text-sm font-semibold text-primary-700">{eyebrow}</p>
      <h1 className="text-2xl font-bold leading-snug tracking-tight text-neutral-900">{title}</h1>
      <p className="mt-3 text-base leading-relaxed text-neutral-600">{description}</p>
    </header>
  );
}
