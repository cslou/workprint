import { defineConfig } from 'vite';

export default defineConfig({
  // No public environment contract exists yet; never load private dotenv files here.
  envDir: false,
});
