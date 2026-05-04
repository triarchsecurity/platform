# Plan 01-03 — IAM Grants Runbook

> Live record of the IAM bindings applied so the App Hosting runtime
> service accounts of `triarch-dev-website` (admin) and
> `triarchsecurity-admin` (CRM) can read from `triarch-vault`.
> Generated 2026-05-04.

---

## Sanity check — 7 secrets present in triarch-vault

```bash
$ gcloud secrets list --project=triarch-vault --format="value(name)" | sort
GITHUB_APP_ID
GITHUB_APP_INSTALLATION_ID
GITHUB_APP_PRIVATE_KEY
SLACK_BOT_TOKEN
SLACK_PAYLOAD_SECRET
SLACK_SIGNING_SECRET
SLACK_USER_MAP
```

## Step 1 — Verified runtime service account names

### triarch-dev-website (admin app)

```
EMAIL                                                                     DISPLAY NAME                                  DISABLED
276081117950-compute@developer.gserviceaccount.com                        Default compute service account               False
firebase-adminsdk-fbsvc@triarch-dev-website.iam.gserviceaccount.com       firebase-adminsdk                             False
firebase-app-hosting-compute@triarch-dev-website.iam.gserviceaccount.com  Firebase App Hosting compute service account  False
```

**Selected SA:** `firebase-app-hosting-compute@triarch-dev-website.iam.gserviceaccount.com` — Selection rule 1 applies (Firebase App Hosting runtime SA present per official docs; this is the SA the deployed admin app runs as).

### triarchsecurity-admin (CRM)

```
EMAIL                                                                       DISPLAY NAME                                  DISABLED
firebase-adminsdk-fbsvc@triarchsecurity-admin.iam.gserviceaccount.com       firebase-adminsdk                             False
firebase-app-hosting-compute@triarchsecurity-admin.iam.gserviceaccount.com  Firebase App Hosting compute service account  False
firebase-deploy-sa@triarchsecurity-admin.iam.gserviceaccount.com            Firebase Deploy Service Account               False
993019184158-compute@developer.gserviceaccount.com                          Default compute service account               False
github-actions@triarchsecurity-admin.iam.gserviceaccount.com                GitHub Actions CI/CD                          False
```

**Selected SA:** `firebase-app-hosting-compute@triarchsecurity-admin.iam.gserviceaccount.com` — Selection rule 1 applies.

```bash
SA_ADMIN="firebase-app-hosting-compute@triarch-dev-website.iam.gserviceaccount.com"
SA_CRM="firebase-app-hosting-compute@triarchsecurity-admin.iam.gserviceaccount.com"
```

## Step 2 — IAM bindings created

### Admin SA bindings (7 secrets)

```bash
$ for SECRET in SLACK_BOT_TOKEN SLACK_SIGNING_SECRET SLACK_PAYLOAD_SECRET \
                GITHUB_APP_ID GITHUB_APP_PRIVATE_KEY GITHUB_APP_INSTALLATION_ID SLACK_USER_MAP; do
    gcloud secrets add-iam-policy-binding "$SECRET" \
      --project=triarch-vault \
      --member="serviceAccount:${SA_ADMIN}" \
      --role="roles/secretmanager.secretAccessor"
  done
```

All 7 invocations succeeded:

```
--- SLACK_BOT_TOKEN ---  role: roles/secretmanager.secretAccessor  etag: BwZRBk8yOTU=  version: 1
--- SLACK_SIGNING_SECRET ---  role: roles/secretmanager.secretAccessor  etag: BwZRBk8-MEI=  version: 1
--- SLACK_PAYLOAD_SECRET ---  role: roles/secretmanager.secretAccessor  etag: BwZRBk9KZnE=  version: 1
--- GITHUB_APP_ID ---  role: roles/secretmanager.secretAccessor  etag: BwZRBk9VXGw=  version: 1
--- GITHUB_APP_PRIVATE_KEY ---  role: roles/secretmanager.secretAccessor  etag: BwZRBk9fugo=  version: 1
--- GITHUB_APP_INSTALLATION_ID ---  role: roles/secretmanager.secretAccessor  etag: BwZRBk9sAkg=  version: 1
--- SLACK_USER_MAP ---  role: roles/secretmanager.secretAccessor  etag: BwZRBk94MaU=  version: 1
```

### CRM SA bindings (2 secrets)

```bash
$ for SECRET in SLACK_BOT_TOKEN SLACK_SIGNING_SECRET; do
    gcloud secrets add-iam-policy-binding "$SECRET" \
      --project=triarch-vault \
      --member="serviceAccount:${SA_CRM}" \
      --role="roles/secretmanager.secretAccessor"
  done
```

Both invocations succeeded:

```
--- SLACK_BOT_TOKEN ---  role: roles/secretmanager.secretAccessor  etag: BwZRBk-EjJM=  version: 1
--- SLACK_SIGNING_SECRET ---  role: roles/secretmanager.secretAccessor  etag: BwZRBk-QraA=  version: 1
```

## Step 3 — Verification

### Admin (all 7 ok)

```
SLACK_BOT_TOKEN: serviceAccount:firebase-app-hosting-compute@triarch-dev-website.iam.gserviceaccount.com
SLACK_SIGNING_SECRET: serviceAccount:firebase-app-hosting-compute@triarch-dev-website.iam.gserviceaccount.com
SLACK_PAYLOAD_SECRET: serviceAccount:firebase-app-hosting-compute@triarch-dev-website.iam.gserviceaccount.com
GITHUB_APP_ID: serviceAccount:firebase-app-hosting-compute@triarch-dev-website.iam.gserviceaccount.com
GITHUB_APP_PRIVATE_KEY: serviceAccount:firebase-app-hosting-compute@triarch-dev-website.iam.gserviceaccount.com
GITHUB_APP_INSTALLATION_ID: serviceAccount:firebase-app-hosting-compute@triarch-dev-website.iam.gserviceaccount.com
SLACK_USER_MAP: serviceAccount:firebase-app-hosting-compute@triarch-dev-website.iam.gserviceaccount.com
```

### CRM (2 ok)

```
SLACK_BOT_TOKEN: serviceAccount:firebase-app-hosting-compute@triarchsecurity-admin.iam.gserviceaccount.com
SLACK_SIGNING_SECRET: serviceAccount:firebase-app-hosting-compute@triarchsecurity-admin.iam.gserviceaccount.com
```

`secretAccessor` role binding present on every consumer × secret pair (7 + 2 = 9 bindings total). No `MISSING` results.
