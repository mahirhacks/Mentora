import { createServer } from "node:http";
import { loadEnv } from "./env.js";
import { handleRequest } from "./routes.js";

const env = loadEnv();

const server = createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    console.error(error);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal server error",
      }),
    );
  });
});

server.listen(env.port, () => {
  console.log(`Mentora server listening on http://localhost:${env.port}`);
});
