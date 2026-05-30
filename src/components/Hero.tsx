export function Hero() {
  return (
    <section className="flex min-h-screen flex-col items-center justify-center px-6 pt-20">
      <div className="mx-auto max-w-4xl text-center">
        <p className="mb-6 text-sm font-medium uppercase tracking-widest text-accent">
          Custom Development by Triarch Security LLC
        </p>

        <h1 className="mb-8 text-5xl font-bold leading-tight tracking-tight md:text-7xl">
          Your idea,
          <br />
          <span className="text-accent">engineered.</span>
        </h1>

        <p className="mx-auto mb-12 max-w-2xl text-lg leading-relaxed text-muted md:text-xl">
          We don&apos;t build apps. We build the tools that change how you
          operate. AI-powered systems, custom platforms, and bespoke software
          &mdash; designed around your business, not a template.
        </p>

        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <a
            href="#contact"
            className="inline-flex items-center rounded-full bg-accent px-8 py-3.5 text-sm font-semibold text-background transition-colors hover:bg-accent-hover"
          >
            Start a Conversation
          </a>
          <a
            href="#services"
            className="inline-flex items-center rounded-full border border-border px-8 py-3.5 text-sm font-medium text-muted transition-colors hover:border-foreground hover:text-foreground"
          >
            See What We Build
          </a>
        </div>
      </div>

      <div className="mt-auto pb-8 animate-bounce">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-muted"
        >
          <path d="M12 5v14M5 12l7 7 7-7" />
        </svg>
      </div>
    </section>
  );
}
