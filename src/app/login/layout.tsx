import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

const MARKETING_HOSTS = new Set(['triarch.dev', 'www.triarch.dev']);

async function publicHost() {
  const h = await headers();
  const raw = h.get('x-forwarded-host') ?? h.get('host') ?? '';
  return raw.toLowerCase().split(',')[0].trim().split(':')[0];
}

export default async function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const host = await publicHost();
  if (MARKETING_HOSTS.has(host)) {
    redirect('https://admin.triarch.dev/login');
  }
  return children;
}
