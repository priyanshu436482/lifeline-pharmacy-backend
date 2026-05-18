const os = require('os');
const { app, initializeDatabase, PORT } = require('./app');

function getLocalNetworkIp() {
  const interfaces = os.networkInterfaces();

  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses) {
      if (address.family === 'IPv4' && !address.internal) {
        return address.address;
      }
    }
  }

  return null;
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`  PC:     http://localhost:${PORT}`);

  const networkIp = getLocalNetworkIp();
  if (networkIp) {
    console.log(`  Mobile: http://${networkIp}:${PORT}  (phone must use same Wi‑Fi)`);
  }

  initializeDatabase()
    .then(() => console.log('Product storage ready'))
    .catch((error) => {
      console.error('Product storage init failed:', error.message);
    });
});
