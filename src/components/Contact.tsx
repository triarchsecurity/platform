export function Contact() {
  return (
    <section id="contact" className="border-t border-border px-6 py-24">
      <div className="mx-auto max-w-4xl text-center">
        <p className="mb-4 text-sm font-medium uppercase tracking-widest text-accent">
          Let&apos;s Build Something
        </p>
        <h2 className="mb-6 text-4xl font-bold tracking-tight">
          Got an idea?
          <br />
          We want to hear it.
        </h2>
        <p className="mx-auto mb-12 max-w-xl text-lg text-muted leading-relaxed">
          Whether it&apos;s a fully formed concept or a napkin sketch, the best
          projects start with a conversation. No commitment, no sales pitch
          &mdash; just two people talking about what&apos;s possible.
        </p>

        <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-center">
          <a
            href="mailto:dev@triarchsecurity.com"
            className="inline-flex items-center gap-2 rounded-full bg-accent px-8 py-3.5 text-sm font-semibold text-background transition-colors hover:bg-accent-hover"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect width="20" height="16" x="2" y="4" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
            dev@triarchsecurity.com
          </a>
          <a
            href="https://calendar.google.com/calendar/appointments"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-border px-8 py-3.5 text-sm font-medium text-muted transition-colors hover:border-foreground hover:text-foreground"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M8 2v4M16 2v4" />
              <rect width="18" height="18" x="3" y="4" rx="2" />
              <path d="M3 10h18" />
            </svg>
            Schedule a Call
          </a>
        </div>
      </div>
    </section>
  );
}
