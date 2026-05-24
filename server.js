const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const port = Number(process.env.PORT || 5173);
const root = __dirname;
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function readJsonBody(request) {
  return new Promise((resolve) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function loadFixture() {
  const fixturePath = path.join(root, "data", "dashboard-fixtures.json");
  return JSON.parse(fs.readFileSync(fixturePath, "utf8"));
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (url.pathname === "/dashboard-ui/api/get-categories" && request.method === "GET") {
    const fixture = loadFixture();
    sendJson(response, 200, fixture.responses.categories);
    return;
  }

  if (url.pathname === "/dashboard-ui/api/category-sales" && request.method === "POST") {
    readJsonBody(request).then((body) => {
      const fixture = loadFixture();
      const screenName = body.screen_name || "";
      const cardName = body.kpi_card_name || "";
      let responseKey = "categoryOverview";

      if (screenName === "product_trends_upc_performance_data" || cardName === "UPC_performance_data") {
        responseKey = "upcPerformance";
      } else if (screenName === "fiscal_vendor_level_display") {
        responseKey = "vendorPerformance";
      }

      sendJson(response, 200, {
        ...fixture.responses[responseKey],
        cache_status: "loaded from local API endpoint",
        request_echo: body
      });
    });
    return;
  }

  const requestPath = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname);
  const safePath = path.normalize(requestPath).replace(/^[/\\]+/, "").replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(root, safePath);

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500);
      response.end(error.code === "ENOENT" ? "Not found" : "Server error");
      return;
    }

    response.writeHead(200, { "Content-Type": types[path.extname(filePath)] || "application/octet-stream" });
    response.end(content);
  });
});

server.listen(port, () => {
  console.log(`Merchandising dashboard running at http://localhost:${port}`);
});
