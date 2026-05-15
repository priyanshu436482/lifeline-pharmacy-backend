const { app, initializeDatabase, PORT } = require('./app');

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);

  initializeDatabase()
    .then(() => console.log('Product storage ready'))
    .catch((error) => {
      console.error('Product storage init failed:', error.message);
    });
});
