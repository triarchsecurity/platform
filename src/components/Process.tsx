const steps = [
  {
    number: "01",
    title: "Conversation",
    description:
      "We start by listening. What's the problem? What have you tried? What does success look like? No intake forms, no 30-page RFPs — a real conversation about what you need.",
  },
  {
    number: "02",
    title: "Scope & Design",
    description:
      "We map out the system together. What it does, how it works, what it doesn't do. You'll see the architecture before a single line of code is written. No surprises.",
  },
  {
    number: "03",
    title: "Build",
    description:
      "Senior engineering from day one. We build in tight iterations with regular check-ins — you see real progress, not status reports. If something needs to change, we change it early.",
  },
  {
    number: "04",
    title: "Ship & Own",
    description:
      "You get a production-ready system that you own outright. No vendor lock-in, no monthly platform fees, no hostage situations. Your code, your data, your infrastructure.",
  },
];

export function Process() {
  return (
    <section id="process" className="border-t border-border px-6 py-24">
      <div className="mx-auto max-w-4xl">
        <div className="mb-16 text-center">
          <p className="mb-4 text-sm font-medium uppercase tracking-widest text-accent">
            How We Work
          </p>
          <h2 className="mb-6 text-4xl font-bold tracking-tight">
            No mystery. No magic.
            <br />
            Just good engineering.
          </h2>
        </div>

        <div className="flex flex-col gap-12">
          {steps.map((step, i) => (
            <div
              key={step.number}
              className="group flex gap-8"
            >
              <div className="flex flex-col items-center">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border text-sm font-bold text-accent transition-colors group-hover:border-accent group-hover:bg-accent/10">
                  {step.number}
                </span>
                {i < steps.length - 1 && (
                  <div className="mt-4 h-full w-px bg-border" />
                )}
              </div>
              <div className="pb-12">
                <h3 className="mb-3 text-xl font-bold">{step.title}</h3>
                <p className="text-muted leading-relaxed max-w-xl">
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
