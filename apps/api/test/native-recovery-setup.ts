import { query } from './postgres.js';

/** Only the isolated harness setup role creates these fixture records. */
export async function prepareNativeRecovery(setupUrl: string) {
  await query(setupUrl, `CREATE SCHEMA qualification;
    CREATE TABLE qualification.intent (
      logical_id uuid PRIMARY KEY, run_id uuid UNIQUE NOT NULL, resource_id uuid NOT NULL,
      boundary text NOT NULL, committed_at timestamptz NOT NULL DEFAULT now(),
      wait_deadline timestamptz NOT NULL DEFAULT now() + interval '5 seconds',
      run_deadline timestamptz NOT NULL DEFAULT now() + interval '10 seconds'
    );
    CREATE TABLE qualification.effect (
      logical_id uuid PRIMARY KEY REFERENCES qualification.intent(logical_id),
      run_id uuid UNIQUE NOT NULL REFERENCES qualification.intent(run_id)
    );
    GRANT USAGE ON SCHEMA qualification TO wp_serving;
    GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA qualification TO wp_serving;`);
}
