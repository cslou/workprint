// Immutable image references shared by acquisition and orb cache preparation.
export const postgresImage = 'postgres@sha256:266d3c257594e195b309ae9d1805e54c788f1d7b375f56bf6c367aac6c917e7b';
export const SEAWEED_IMAGE = 'chrislusf/seaweedfs:4.51@sha256:f7a49e3f3972ebed5be2ed4befa4a0c68eb7bdddba6e692d42729ceb545134b8';
// Official Supabase CLI images. Mailpit: github.com/axllent/mailpit, MIT, mirror v1.31.3.
export const authImages = {
  auth: 'public.ecr.aws/supabase/gotrue@sha256:87db8c737af49a64236c461882ed3925f8b1e5c2c47176c64694dedc65153573',
  mail: 'public.ecr.aws/supabase/mailpit@sha256:ed9b00c609e77e99c79b93f1178255ebc271868920f2c69a8d166bd5634ed10d',
} as const;
