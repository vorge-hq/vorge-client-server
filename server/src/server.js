const app = require("./app");
const env = require("./config/env");

app.listen(env.port, () => {
  console.log(`Vorge server listening on port ${env.port}`);
});
