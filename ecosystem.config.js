module.exports = {
  apps: [
    {
      name: "quattro-tracker-server",
      script: "dist/index.js",
      cwd: __dirname,
      // dotenv/config (loaded at the top of src/index.ts) reads .env from
      // cwd at runtime, so no PM2 `env`/`env_file` block is needed here.
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "300M",
      out_file: "logs/out.log",
      error_file: "logs/error.log",
      merge_logs: true,
      time: true,
    },
  ],
};
