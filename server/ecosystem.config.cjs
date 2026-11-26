module.exports = {
  apps: [
    {
      name: 'kanban-server',
      cwd: __dirname,
      script: 'src/app.js',
      instances: 1,
      autorestart: true,
      max_memory_restart: '256M',
      env: {
        NODE_ENV: 'production',
        PORT: '3100',
        HOST: '127.0.0.1',
        KANBAN_DATA_DIR: '/opt/kanban/data',
        DIST_DIR: '/opt/kanban/app/dist'
      }
    }
  ]
}
