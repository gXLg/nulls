const fs = require("fs");
const { randomUUID } = require("crypto");
const { join } = require("path");
const { optparser } = require("gxlg-utils");

const express = require("express");
const cookieParser = require("cookie-parser");
const cheerio = require("cheerio");
const multer = require("multer");
const cors = require("cors");
const helmet = require("helmet");

class NullBaseError extends Error {
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

class NullsPathError extends NullBaseError {}
class NullsArgumentError extends NullBaseError {}
class NullsScriptError extends NullBaseError {}

const parser = optparser([
  { "name": "uploads",       "types": ["./uploads/", false]      },
  { "name": "uploadLimit",   "types": [false, 0]                 },
  { "name": "forceHTTPS",    "types": [false]                    },
  { "name": "init",          "types": [() => {}, async () => {}] },
  { "name": "hook",          "types": [() => {}, async () => {}] },
  { "name": "nulls",         "types": ["./nulls/"]               },
  { "name": "root",          "types": ["root.html"]              },
  { "name": "static",        "types": ["./static/", false]       },
  { "name": "port",          "types": [8080]                     },
  { "name": "ready",         "types": [() => {}, async () => {}] },
  { "name": "preprocessor",  "types": [() => {}, async () => {}] },
  { "name": "postprocessor", "types": [() => {}, async () => {}] },
  { "name": "textprocessor", "types": [t => t, async t => t]     },
  { "name": "srcProviders",  "types": [{}]                       },
  { "name": "plugins",       "types": [[]]                       },
  { "name": "domain",        "types": [""],     "required": true },
  { "name": "redirects",     "types": [{}],                      }

], NullsArgumentError);

function parentRequire(mod) {
  const p = "./" + mod;
  const f = require.main.path;
  const m = require.resolve(p, { "paths": [f] });
  return require(m);
}

async function exec(code, block) {
  if (block) {
    return await eval("(async require => {" + code + "})(parentRequire);");
  } else {
    return await eval("(async require => { return (" + code + "); })(parentRequire);");
  }
}

async function nulls(opt = {}) {
  const options = parser(opt);

  async function handleAttrScript(element, name) {
    // first try attribute
    const attr = element.attr(name);
    element.attr(name, null);
    if (attr) {
      if (attr[0] == "$") {
        const path = attr.slice(1);
        return parentRequire(path);
      } else if (attr[0] == "#") {
        const value = attr.slice(1);
        return () => value;
      } else {
        // try other providers first
        for (const p in options.srcProviders) {
          if (attr.startsWith(p)) {
            const val = attr.slice(p.length);
            return await options.srcProviders[p](val);
          }
        }
        // then run inline script
        return await exec(attr, false);
      }
    }
    // then try script block
    const s = element.find("script[" + name + "]");
    const script = s.text();
    if (script != "") {
      s.remove();
      return await exec(script, true);
    }
    // finally, just return null
    return null;
  }

  for (let p = options.plugins.length - 1; p >= 0; p--) {
    const plugin = options.plugins[p];
    await plugin(options);
  }

  const app = express();
  await options.init(app);
  app.use((req, res, next) => { res.setHeader("X-Powered-By", "Express + nulls"); next(); });

  if (options.static) app.use("/static", cors(), express.static(options.static));

  if (options.forceHttps) app.enable("trust proxy");
  app.use(async (req, res, next) => {
    const host = req.get("host");
    if (host != "localhost" && options.forceHttps && !req.secure)
      return res.redirect("https://" + host + req.url);
    next();
  });
  app.use(cookieParser());

  app.use(helmet.frameguard({ "action": "sameorigin" }));
  app.use(cors({ "origin": options.domain }));

  const paths = new Set();
  const open = [options.nulls];
  while (open.length) {
    const current = open.shift();
    for (const entry of fs.readdirSync(current, { "withFileTypes": true })) {
      const fullPath = join(entry.parentPath ?? entry.path, entry.name);
      if (entry.isDirectory()) open.push(fullPath);
      else if (fullPath.endsWith(".html")) paths.add(fullPath);
    }
  }

  const root = join(options.nulls, options.root);
  if (!paths.has(root)) {
    throw new NullsPathError(
      "The root container '" + options.root +
      "' was not found under the specified location '" + options.nulls + "'"
    );
  }

  const containers = {};
  const lists = {};
  const adders = {};
  const datas = {};
  const attrs = {};
  const aargs = {};

  const ifs = {};

  const htmls = {};

  const apis = {};

  for (const file of paths) {
    const content = fs.readFileSync(file, "utf8");
    const html = file == root ? cheerio.load(content) : cheerio.load(content, null, false);

    const cont = html("[null-container]:not(script)");
    containers[file] = {};
    lists[file] = {};
    for (let i = 0; i < cont.length; i++) {
      const l = cont.eq(i);
      const script = await handleAttrScript(l, "null-container");
      if (script == null) {
        throw new NullsArgumentError(
          "Container #" + i + " at " + file + " does not provide a script"
        );
      }
      const lscript = await handleAttrScript(l, "null-list");

      const id = l.attr("null-id") ?? randomUUID();
      l.attr("null-id", id);
      containers[file][id] = script;
      if (lscript != null) lists[file][id] = lscript;
    }

    const add = html("[null-adder]:not(script)");
    adders[file] = {};
    for (let i = 0; i < add.length; i++) {
      const l = add.eq(i);
      const script = await handleAttrScript(l, "null-adder");
      if (script == null) {
        throw new NullsArgumentError(
          "Adder #" + i + " at " + file + " does not provide a script"
        );
      }
      const lscript = await handleAttrScript(l, "null-list");

      const id = l.attr("null-id") ?? randomUUID();
      l.attr("null-id", id);
      adders[file][id] = script;
      if (lscript != null) lists[file][id] = lscript;
    }

    const data = html("[null-data]:not(script)");
    datas[file] = {};
    for (let i = 0; i < data.length; i++) {
      const l = data.eq(i);
      const script = await handleAttrScript(l, "null-data");
      if (script == null) {
        throw new NullsArgumentError(
          "Data #" + i + " at " + file + " does not provide a script"
        );
      }
      const id = l.attr("null-id") ?? randomUUID();
      l.attr("null-id", id);
      datas[file][id] = script;
    }

    const tag = html("[null-attr]:not(script)");
    attrs[file] = {};
    for (let i = 0; i < tag.length; i++) {
      const l = tag.eq(i);
      const script = await handleAttrScript(l, "null-attr");
      if (script == null) {
        throw new NullsArgumentError(
          "Attribute #" + i + " at " + file + " does not provide a script"
        );
      }
      const id = l.attr("null-id") ?? randomUUID();
      l.attr("null-id", id);
      attrs[file][id] = script;
    }

    const aarg = html("[null-arg]:not(script)");
    aargs[file] = {};
    for (let i = 0; i < aarg.length; i++) {
      const l = aarg.eq(i);
      const script = await handleAttrScript(l, "null-arg");
      if (script == null) {
        throw new NullsArgumentError(
          "Argument #" + i + " at " + file + " does not provide a script"
        );
      }
      const id = l.attr("null-id") ?? randomUUID();
      l.attr("null-id", id);
      aargs[file][id] = script;
    }

    const cond = html("[null-if]:not(script)");
    ifs[file] = {};
    for (let i = 0; i < cond.length; i++) {
      const l = cond.eq(i);
      const script = await handleAttrScript(l, "null-if");
      if (script == null) {
        throw new NullsArgumentError(
          "Condition #" + i + " at " + file + " does not provide a script"
        );
      }
      const id = l.attr("null-id") ?? randomUUID();
      l.attr("null-id", id);
      ifs[file][id] = script;
    }

    const api = html("[null-api]:not(script)");
    for (let i = 0; i < api.length; i++) {
      const l = api.eq(i);
      const f = l.is("form") ? "" : "form";

      const script = await handleAttrScript(l, "null-api");
      const ascript = await handleAttrScript(l, "null-access");

      const ajax = l.attr("null-ajax");
      if (ajax != null) {
        l.attr("null-ajax", null);
        if (l.is("form")) {
          l.attr("onsubmit", "((e,t)=>{e.preventDefault();fetch(t.action,{method:'POST',body:new FormData(t)}).then(" + ajax + ");})(event,this)");
        } else {
          l.attr("onclick", "((e,t)=>{e.preventDefault();fetch(t.formAction,{method:'POST',body:new FormData(t.form)}).then(" + ajax + ");})(event,this)");
        }
      }

      l.attr(f + "enctype", "multipart/form-data");
      l.attr(f + "method", "POST");

      const action = l.attr(f + "action");
      if (action == null) {
        throw new NullsArgumentError(
          "API #" + i + " at " + file + " does not provide an action"
        );
      }

      const up = await handleAttrScript(l, "null-upload");
      if (up && !options.uploads) {
        throw new NullsArgumentError(
          "API #" + i + " at " + file +
          " provides upload although the upload was disabled"
        );
      }

      if (!(action in apis)) apis[action] = { };
      const p = apis[action];
      if (p.script != null && script != null) {
        throw new NullsArgumentError(
          "API #" + i + " at " + file + " provides a script, but this action already has a script"
        );
      }
      p.script = script;
      if (p.ascript != null && ascript != null) {
        throw new NullsArgumentError(
          "API #" + i + " at " + file + " provides an access script, but this action already has an access script"
        );
      }
      p.ascript = ascript;
      if (p.up != null && up != null) {
        throw new NullsArgumentError(
          "API #" + i + " at " + file + " provides an upload, but this action already has an upload"
        );
      }
      p.up = up;
    }

    htmls[file] = html.html();
  }

  app.head("*", (req, res) => {
    res.type("html");
    res.end();
  });

  app.use(async (req, res, next) => {
    try {
      await options.hook(req, res);
      next();
    } catch (e) {
      console.error("Error occured during hook execution on", req.method, req.path);
      console.error(e);
      res.status(500).end("Internal Server Error");
    }
  });

  const upload = multer({ "dest": options.uploads });
  for (const action in apis) {
    const p = apis[action];
    if (p.script == null) {
      throw new NullsArgumentError(
        "API for " + action + " does not provide a script"
      );
    }
    const script = p.script;
    const ascript = p.ascript;
    const up = p.up ?? { };

    let limit = null;
    if ("*" in up) {
      limit = up["*"];
      delete up["*"];
    } else if (options.uploadLimit !== false) {
      limit = options.uploadLimit;
    }

    const u = [];
    for (const name in up) {
      u.push({ name, "maxCount": up[name] });
    }

    app.post(action, async (req, res, next) => {
      if (limit != null) {
        const size = parseInt(req.headers["content-length"]);
        if (isNaN(size)) return res.status(411).end("Length Required");
        if (size > limit) return res.status(413).end("Content Too Large");
      }
      try {
        if (ascript != null && !(await ascript(req, res)))
          return res.status(403).end("Permission Denied");
        next();
      } catch (e) {
        console.error("Error occured during API access check for", action);
        console.error(e);
        res.status(500).end("Internal Server Error");
      }
    }, upload.fields(u), async (err, req, res, next) => {
      if (err) {
        return res.status(400).end("Bad Request");
      }
      next();
    }, async (req, res) => {
      if (req.body == null || req.files == null) {
        return res.status(400).end("Bad Request");
      }
      try {
        await script(req, res);
      } catch (e) {
        console.error("Error occured during API execution of", action);
        console.error(e);
        res.status(500).end("Internal Server Error");
      }
      for (const name in req.files) {
        for (const { path } of req.files[name]) {
          try {
            fs.unlinkSync(path);
          } catch (e) {
            console.error("Error occured during API cleanup of", action);
            console.error(e);
          }
        }
      }
    });
  }

  for (const name in options.redirects) {
    app.get(name, async (req, res) => {
      const url = await options.redirects[name](req, res);

      res.end(`
<!DOCTYPE html>
<html> <head> <meta http-equiv="refresh" content="0;url=${url}" />
<script> window.location.href = "${url}"; </script>
</head> <body> Redirecting... </body> </html>
`);

    });
  }

  app.get("*", async (req, res) => {

    async function render(partf, ...args) {
      const file = join(options.nulls, partf);
      if (!(file in htmls)) {
        throw new NullsPathError(
          "Expected to render '" + file +
          "', but it was not found"
        );
      }
      const html = file == root ? cheerio.load(htmls[file]) : cheerio.load(htmls[file], null, false);
      await options.preprocessor(html, req, res);

      const nulls = html("[null-id]");
      for (let i = 0; i < nulls.length; i++) {
        const element = nulls.eq(i);
        const id = element.attr("null-id");
        element.attr("null-id", null);
        let found = false;

        const cargs = [...args];
        if (id in aargs[file]) {
          cargs.push(await aargs[file][id](...args));
        }

        let condition = true;
        if (id in ifs[file]) { condition = await ifs[file][id](...cargs); }
        if (!condition) continue;

        if (id in containers[file]) {
          if (id in lists[file]) {
            element.html("");
            const l = await lists[file][id](...cargs);
            if (!(Symbol.iterator in Object(l))) {
              throw new NullsScriptError(
                "List #" + i + " at " + file + " is not iterable!"
              );
            }
            for (const el of l) {
              const c = await containers[file][id](...cargs, el);
              element.append(await render(c, ...cargs, el));
            }
          } else {
            const c = await containers[file][id](...cargs);
            element.html(await render(c, ...cargs));
          }
          found = true;
        }
        if (id in datas[file]) {
          const d = await datas[file][id](...cargs);
          element.text(d);
          found = true;
        }
        if (id in attrs[file]) {
          const t = await attrs[file][id](...cargs);
          for (const n in t) element.attr(n, t[n]);
          found = true;
        }
        // adder in complete end (add after all others)
        if (id in adders[file]) {
          if (id in lists[file]) {
            const l = await lists[file][id](...cargs);
            if (!(Symbol.iterator in Object(l))) {
              throw new NullsScriptError(
                "List #" + i + " at " + file + " is not iterable!"
              );
            }
            for (const el of l) {
              const c = await adders[file][id](...cargs, el);
              element.append(await render(c, ...cargs, el));
            }
          } else {
            const c = await adders[file][id](...cargs);
            element.append(await render(c, ...cargs));
          }
          found = true;
        }
        if (!found) {
          throw new NullsArgumentError(
            "Non-reachable null element #" + i +
            " at " + file
          );
        }
      }
      if (file == root) await options.postprocessor(html, req, res);
      const txt = html.html();
      if (file == root) return await options.textprocessor(txt, req, res);
      return txt;
    }
    try {
      const html = await render(options.root, req, res);
      res.type("html").end(html);
    } catch (e) {
      console.error("Error occured during dynamic rendering of", req.method, req.path);
      console.error(e);
      res.status(500).end("Internal Server Error");
    }
  });

  return app.listen(options.port, () => options.ready());
}

module.exports = { nulls, NullsPathError, NullsArgumentError, NullsScriptError };
