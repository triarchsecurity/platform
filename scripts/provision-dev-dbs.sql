-- scripts/provision-dev-dbs.sql
-- One-shot SQL to create per-app dev databases on the new dev CRDB cluster.
--
-- Apply against the dev cluster (NOT prod):
--   cockroach sql --url "<dev-cluster-url>" -f scripts/provision-dev-dbs.sql
--
-- Idempotent: CREATE DATABASE IF NOT EXISTS is a no-op if the database already exists.
-- Re-running after a partial failure is safe.
--
-- Six databases — one per Triarch-owned project:
--   admin_dev        triarch-dev admin control plane
--   portal_dev       triarchsecurity-portal (customer portal)
--   darksouls_dev    darksouls-rpg
--   tmi_dev          tmi (ThisMomInforms)
--   truthtreason_dev truth+treason
--   www_dev          www.triarchsecurity.com

CREATE DATABASE IF NOT EXISTS admin_dev;
CREATE DATABASE IF NOT EXISTS portal_dev;
CREATE DATABASE IF NOT EXISTS darksouls_dev;
CREATE DATABASE IF NOT EXISTS tmi_dev;
CREATE DATABASE IF NOT EXISTS truthtreason_dev;
CREATE DATABASE IF NOT EXISTS www_dev;

-- Verification — run after applying to confirm all six databases exist:
-- SHOW DATABASES;
