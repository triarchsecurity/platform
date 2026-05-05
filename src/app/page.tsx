import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { About } from "@/components/About";
import { Services } from "@/components/Services";
import { Process } from "@/components/Process";
import { Contact } from "@/components/Contact";
import { Footer } from "@/components/Footer";

const ADMIN_HOSTS = new Set([
  "admin.triarch.dev",
  "admin-dev.triarch.dev",
  "admin-dev--triarch-dev-website.us-central1.hosted.app",
]);

async function publicHost() {
  const h = await headers();
  const raw = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  return raw.toLowerCase().split(",")[0].trim().split(":")[0];
}

export default async function Home() {
  const host = await publicHost();
  if (ADMIN_HOSTS.has(host)) {
    redirect("/login");
  }

  return (
    <>
      <Header />
      <main className="flex-1">
        <Hero />
        <About />
        <Services />
        <Process />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
