const services = [
  {
    title: "Market Intelligence System",
    category: "AI Content Engine",
    description:
      "Low-friction blog and LinkedIn posts, aligned to your company's voice, tone, and strategic focus areas. The system learns how you write and gets better over time — reducing the effort to maintain a consistent marketing presence from hours to minutes.",
    outcomes: [
      "Learns your writing style and improves with every post",
      "Company and individually aligned context and tone",
      "Reduces LinkedIn marketing effort by 80%+",
    ],
  },
  {
    title: "Social Media Content Creator",
    category: "AI Visual Content",
    description:
      "100% AI-generated Instagram and TikTok content, built around marketing campaigns that actually matter to your business. Not generic stock content — strategic visual storytelling powered by AI, tailored to your brand and goals.",
    outcomes: [
      "Campaign-driven content, not random posts",
      "Instagram and TikTok native formats",
      "Full content pipeline from idea to published",
    ],
  },
  {
    title: "Custom CRM Solution",
    category: "Business Operations",
    description:
      "Enterprise-grade contact management without the enterprise price tag. Purpose-built for small LLCs and companies that need a CRM that actually fits their workflow — not a one-size-fits-all platform that costs $200/seat/month.",
    outcomes: [
      "Built around your actual workflow, not Salesforce's",
      "No per-seat licensing — you own it",
      "Scales with your business, not against it",
    ],
  },
  {
    title: "Your Idea, Built",
    category: "Custom Development",
    description:
      "Have a tool in mind that doesn't exist? A workflow that could be automated? A system that would change how your team operates? Bring us the idea. We'll help you think through it, scope it, and build it — together.",
    outcomes: [
      "From concept to production-ready",
      "Collaborative design and development process",
      "Built to own, not to rent",
    ],
  },
];

export function Services() {
  return (
    <section id="services" className="border-t border-border px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mb-16 max-w-2xl">
          <p className="mb-4 text-sm font-medium uppercase tracking-widest text-accent">
            What We Build
          </p>
          <h2 className="mb-6 text-4xl font-bold tracking-tight">
            Systems that work as hard as you do.
          </h2>
          <p className="text-lg text-muted leading-relaxed">
            Every product listed here started as someone&apos;s problem. We
            didn&apos;t build them because they were trendy &mdash; we built
            them because they were needed. Here&apos;s what that looks like.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-2">
          {services.map((service) => (
            <div
              key={service.title}
              className="group rounded-2xl border border-border bg-surface p-8 transition-colors hover:border-accent/30"
            >
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-accent">
                {service.category}
              </p>
              <h3 className="mb-4 text-2xl font-bold">{service.title}</h3>
              <p className="mb-6 text-muted leading-relaxed">
                {service.description}
              </p>
              <ul className="flex flex-col gap-3">
                {service.outcomes.map((outcome) => (
                  <li
                    key={outcome}
                    className="flex items-start gap-3 text-sm text-muted"
                  >
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                    {outcome}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
