import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set for the network-api service.");
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Small standalone directory service: no ORM/migration toolchain, schema is
 * created idempotently on boot so a fresh DATABASE_URL just works.
 */
export async function ensureSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contractors (
      id text PRIMARY KEY,
      name text NOT NULL,
      api_key text NOT NULL UNIQUE,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS profiles (
      id text PRIMARY KEY,
      claim_token text UNIQUE,
      company_name text NOT NULL,
      contact_name text,
      email text,
      phone text,
      utr_number text,
      cis_status text NOT NULL DEFAULT 'unverified',
      cis_verified_at timestamptz,
      cis_verification_ref text,
      insurance_provider text,
      insurance_policy_number text,
      public_liability_expiry date,
      cscs_card_number text,
      cscs_card_expiry date,
      nrswa_card_number text,
      nrswa_expiry date,
      plant_tickets jsonb NOT NULL DEFAULT '[]',
      claimed_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS profile_links (
      id text PRIMARY KEY,
      profile_id text NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      contractor_id text NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
      local_subcontractor_id text NOT NULL,
      status text NOT NULL DEFAULT 'invited',
      invited_at timestamptz NOT NULL DEFAULT now(),
      linked_at timestamptz,
      UNIQUE (profile_id, contractor_id)
    );
    -- Guards against duplicate profiles for the same subcontractor: two
    -- contractors entering the same UTR should be matched to one shared
    -- profile (via /profiles/search + /profiles/:id/link) instead of a
    -- second record being created. NULLs (no UTR yet) may repeat freely.
    CREATE UNIQUE INDEX IF NOT EXISTS profiles_utr_unique_idx
      ON profiles (upper(regexp_replace(utr_number, '\\s+', '', 'g')))
      WHERE utr_number IS NOT NULL;
  `);
}
