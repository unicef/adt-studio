import { SUPPORTERS } from "@/data/supporters";

/** Visible partner/supporter logos, linking out — for the docs. */
export function PartnersStrip() {
  return (
    <div className="not-prose mt-4 flex flex-wrap items-center gap-x-10 gap-y-6">
      {SUPPORTERS.map((s) => (
        <a
          key={s.name}
          href={s.href}
          target="_blank"
          rel="noreferrer noopener"
          title={s.name}
          className="inline-flex items-center opacity-80 transition-opacity hover:opacity-100"
        >
          <img
            src={`${import.meta.env.BASE_URL}${s.src}`}
            alt={s.name}
            className={`${s.heightClass} w-auto object-contain`}
          />
        </a>
      ))}
    </div>
  );
}
