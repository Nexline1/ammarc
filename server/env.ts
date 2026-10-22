// Imported first so .env is loaded before any module reads process.env.
try { process.loadEnvFile(); } catch { /* no .env file: fine */ }
