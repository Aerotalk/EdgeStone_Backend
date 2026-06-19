module.exports = {
  apps: [
    {
      name: 'edgestone-backend',
      script: './server.js',
      instances: 'max', // Utilizes all available CPU cores
      exec_mode: 'cluster', // Enables Node.js cluster mode for concurrency
      watch: false,
      max_memory_restart: '1G', // Restarts the instance if it exceeds 1GB memory to prevent leaks crashing the system
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
      // Keep-alive settings and back-pressure handling
      kill_timeout: 5000, // Wait 5s for active connections to finish before killing
      listen_timeout: 10000, // Wait 10s for the app to listen
      merge_logs: true, // Merges logs from all cluster workers into one file
    },
  ],
};
