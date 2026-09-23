const path = require("path");
 
const rootDir = __dirname;
const logsDir = path.join(rootDir, "logs");
 
module.exports = {
  apps: [
    {
      name: "ethvote-backend",
      script: path.join(rootDir, "server.js"),
      cwd: rootDir,
      instances: "max",   
      exec_mode: "cluster", 
      autorestart: true,
      max_memory_restart: "500M",
 
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm Z",
      error_file: path.join(logsDir, "ethvote-backend-error.log"),
      out_file: path.join(logsDir, "ethvote-backend-out.log"),
 
      watch: false,  // watch band karo — restart loop hota hai
      ignore_watch: ["node_modules", "logs"],
 
      env: {
        NODE_ENV: "development",
        PORT: 5000,
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 5000,
      },
    },
  ],
};