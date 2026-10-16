import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

const projectRoot = new URL("../", import.meta.url);
const files = new Map([
  ["/", ["index.html", "text/html"]],
  ["/index.html", ["index.html", "text/html"]],
  ["/assets/styles.css", ["assets/styles.css", "text/css"]],
  ["/src/main.js", ["src/main.js", "text/javascript"]],
  ["/src/game.js", ["src/game.js", "text/javascript"]],
  ["/assets/favicon.svg", ["assets/favicon.svg", "image/svg+xml"]],
]);
const port = Number(process.env.PORT ?? 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end("Method not allowed");
    return;
  }
  const pathname = new URL(request.url, "http://localhost").pathname;
  const resource = files.get(pathname);
  if (!resource) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  try {
    const content = await readFile(new URL(resource[0], projectRoot));
    response.writeHead(200, {
      "Content-Type": `${resource[1]}; charset=utf-8`,
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(request.method === "HEAD" ? undefined : content);
  } catch (error) {
    console.error("Unable to serve a game asset:", error);
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Unable to load this game asset.");
  }
});

server.on("error", (error) => {
  console.error("Unable to start Orbit Flip:", error.message);
  process.exitCode = 1;
});
server.listen(port, "127.0.0.1", () => {
  console.log(`Orbit Flip is ready at http://127.0.0.1:${port}`);
});
