import { redirect } from "next/navigation";

// The www.triarch.dev marketing site was extracted into its own repo
// (triarchsecurity/triarch-dev-website) on 2026-05-29 and now serves via its own
// App Hosting backend. This `platform` repo only serves admin.triarch.dev, so the
// root path redirects to the login.
export default function Home() {
  redirect("/login");
}
