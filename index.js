const express = require("express");
const http = require("http");
const fs = require("fs");
const cookieParser = require("cookie-parser");
const cheerio = require("cheerio");
const multer = require("multer");

async function exec(code, block) {
  if (block) {
    return await eval("(async require => {" + code + "})(require.main.require);");
  } else {
    return await eval("(async require => { return (" + code + "); })(require.main.require);");
  }
}

async function handleAttrScript(element, name, def, server) {
  // first try attribute
  const attr = element.attr(name);
  if (attr) {
    element.attr(name, null);
    if (attr[0] == "$") {
      const path = attr.slice(1);
      return server ? require.main.require(path) : fs.readFileSync(path, "utf8");
    } else {
      return server ? (await exec(attr, false)) : attr.trim();
    }
  }
  // then try script
  const s = element.find("script[" + name + "]");
  const script = s.text();
  if (script != "") {
    s.remove();
    return server ? (await exec(script, true)) : "(async () => {" + script.trim() + "})();";
  }

  // finally just return default
  return def;
}

async function handleProvider(element) {
  return await handleAttrScript(element, "null-provider", () => "index", true);
}

async function handleUpload(element) {
  const u = [];
  const r = await handleAttrScript(element, "null-upload", { }, true);
  for (const name in r) {
    u.push({ name, "maxCount": r[name] });
  }
  return u;
}

async function handleParser(element) {
  return await handleAttrScript(element, "null-parser", "r=>r", false);
}

async function handleProcessor(element) {
  return await handleAttrScript(element, "null-processor", () => null, true);
}

async function handleHandler(element) {
  return await handleAttrScript(element, "null-handler", "()=>{}", false);
}

async function handleLoader(element) {
  return await handleAttrScript(element, "null-loader", () => "", true);
}

async function handleValidator(element) {
  return await handleAttrScript(element, "null-validator", () => "", true);
}


module.exports = async (options = {}) => {
  const upload = multer({ "dest": options.uploads ?? "./uploads/" });
  const app = express();
  const server = http.createServer(app);

  await options.init?.(app, server);

  app.use(cookieParser());
  if (options.https) {
    app.enable("trust proxy");
  }
  app.use(async (req, res, next) => {
    if (options.https && !req.secure) return res.redirect("https://" + req.get("host") + req.url);
    await options.hook?.(req);
    next();
  });

  async function installNulls(fpath, path) {
    const all = fs.readdirSync(fpath, { "withFileTypes": true });
    for (const entry of all) {
      const name = entry.name;
      if (entry.isDirectory()) {
        await installNulls(fpath + "/" + name, path + "/" + name);
      } else if (name.endsWith(".html")) {
        const file = fs.readFileSync(fpath + "/" + name, "utf8");
        const html = cheerio.load(file);

        const dummies = [];
        for (let i = 0; i < html("null-container").length; i ++) {
          const l = html("null-container:eq(" + i + ")");
          const nul = l.attr("null");
          const provider = await handleProvider(l);
          const title = l.attr("null-title") != null;
          const dummy = l.attr("null-dummy") != null;
          const upl = upload.fields(await handleUpload(l));
          app.post("/null-container" + path + "/" + nul, upl, async (req, res) => {
            const r = await provider(req, res);
            if (title) res.json(r);
            else res.end(r);
          });
          if (dummy) {
            l.attr("null-dummy", null);
            const h = l.prop("outerHTML");
            app.get("/static/dummies" + path + "/" + nul + ".html", (req, res) => {
              res.end(h);
            });
            dummies.push(l);
          }
        }
        dummies.forEach(d => d.remove());

        for (let i = 0; i < html("null-data").length; i ++) {
          const l = html("null-data:eq(" + i + ")");
          const nul = l.attr("null");
          const validator = await handleValidator(l);
          const upl = upload.fields(await handleUpload(l));
          app.post("/null-validator" + path + "/" + nul, upl, async (req, res) => {
            res.end(await validator(req, res));
          });
          const processor = await handleProcessor(l);
          app.post("/null-data" + path + "/" + nul, upl, async (req, res) => {
            res.json((await processor(req, res)) ?? {});
          });
          const parser = await handleParser(l);
          app.get("/static/parsers" + path + "/" + nul + ".js", (req, res) => {
            res.end(parser);
          });
        }

        for (let i = 0; i < html("null-request").length; i ++) {
          const l = html("null-request:eq(" + i + ")");
          const nul = l.attr("null");
          const processor = await handleProcessor(l);
          const upl = upload.fields(await handleUpload(l));
          app.post("/null-request" + path + "/" + nul, upl, async (req, res) => {
            res.json((await processor(req, res)) ?? {});
          });
          const handler = await handleHandler(l);
          app.get("/static/handlers" + path + "/" + nul + ".js", (req, res) => {
            res.end(handler);
          });
        }

        for (let i = 0; i < html("null-loader").length; i ++) {
          const l = html("null-loader:eq(" + i + ")");
          const nul = l.attr("null");
          const loader = await handleLoader(l);
          const upl = upload.fields(await handleUpload(l));
          app.post("/null-load" + path + "/" + nul, upl, async (req, res) => {
            res.end((await loader(req, res)).toString());
          });
        }

        const fin = html("body").html();
        app.get("/static/nulls" + path + "/" + name, (req, res) => {
          res.end(fin);
        });
      }
    }
  }
  app.post("/null-container/root", upload.none(), (req, res) => { res.end("index"); });
  await installNulls(options.nulls ?? "./null", "");

  const nullJs = fs.readFileSync(__dirname + "/scripts/null.js");
  app.get("/static/null.js", (req, res) => {
    res.setHeader("Content-Type", "text/javascript");
    res.end(nullJs);
  });
  const static = options.static ?? "./files";
  app.use("/static", express.static(static));

  const skeleton = fs.readFileSync(options.skeleton ?? static + "/skeleton.html");
  app.get("*", (req, res) => {
    res.end(skeleton);
  });

  server.listen(options.port ?? 8080, () => options.ready?.());
};
