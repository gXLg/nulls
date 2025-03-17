const fs = require("fs");
const { randomUUID } = require("crypto");
const { join } = require("path");
const { optparser } = require("gxlg-utils");

const express = require("express");
const cookieParser = require("cookie-parser");
const cheerio = require("cheerio");
const multer = require("multer");

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
  { "name": "uploads",      "types": ["./uploads/", false]      },
  { "name": "forceHttps",   "types": [false]                    },
  { "name": "init",         "types": [() => {}, async () => {}] },
  { "name": "hook",         "types": [() => {}, async () => {}] },
  { "name": "nulls",        "types": ["./nulls/"]               },
  { "name": "root",         "types": ["root.html"]              },
  { "name": "static",       "types": ["./static/", false]       },
  { "name": "port",         "types": [8080]                     },
  { "name": "ready",        "types": [() => {}, async () => {}] },
  { "name": "emptyPOST",    "types": [false]                    },
  { "name": "preprocessor", "types": [() => {}, async () => {}] }
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
      return await exec(attr, false);
    }
  }
  // then try script
  const s = element.find("script[" + name + "]");
  const script = s.text();
  if (script != "") {
    s.remove();
    return await exec(script, true);
  }
  // finally, just return null
  return null;
}



async function nulls(opt = {}) {
  const options = parser(opt);

  const upload = multer({ "dest": options.uploads });
  const app = express();
  await options.init(app);
  app.use(cookieParser());
  if (options.forceHttps) app.enable("trust proxy");
  app.use(async (req, res, next) => {
    const host = req.get("host");
    if (host != "localhost" && options.forceHttps && !req.secure)
      return res.redirect("https://" + host + req.url);

    await options.hook(req, res);
    next();
  });

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
  const tags = {};

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

    const tag = html("[null-tag]:not(script)");
    tags[file] = {};
    for (let i = 0; i < tag.length; i++) {
      const l = tag.eq(i);
      const script = await handleAttrScript(l, "null-tag");
      if (script == null) {
        throw new NullsArgumentError(
          "Tagger #" + i + " at " + file + " does not provide a script"
        );
      }
      const id = l.attr("null-id") ?? randomUUID();
      l.attr("null-id", id);
      tags[file][id] = script;
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

  for (const action in apis) {
    const p = apis[action];
    if (p.script == null) {
      throw new NullsArgumentError(
        "API for " + action + " does not provide a script"
      );
    }
    const script = p.script;
    const ascript = p.ascript;
    const up = p.up;

    const u = [];
    for (const name in up ?? { }) {
      u.push({ name, "maxCount": up[name] });
    }

    app.post(action, upload.fields(u), async (req, res, next) => {
      if (!options.emptyPOST && req.body == null) {
        res.status(400);
        return res.end("Bad request");
      }
      if (ascript != null && !(await ascript(req, res))) {
        res.status(403);
        return res.end("Permission denied");
      }
      await script(req, res, next);
    });
  }

  if (options.static) app.use("/static", express.static(options.static));

  app.head("*", (req, res) => {
    res.type("html");
    res.end();
  });

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

        let condition = true;
        if (id in ifs[file]) { condition = await ifs[file][id](...args); }
        if (!condition) continue;

        if (id in containers[file]) {
          if (id in lists[file]) {
            element.html("");
            const l = await lists[file][id](...args);
            if (!(Symbol.iterator in Object(l))) {
              throw new NullsScriptError(
                "List #" + i + " at " + file + " is not iterable!"
              );
            }
            for (const el of l) {
              const c = await containers[file][id](...args, el);
              element.append(await render(c, ...args, el));
            }
          } else {
            const c = await containers[file][id](...args);
            element.html(await render(c, ...args));
          }
          found = true;
        }
        if (id in datas[file]) {
          const d = await datas[file][id](...args);
          element.text(d);
          found = true;
        }
        if (id in tags[file]) {
          const [n, v] = await tags[file][id](...args);
          element.attr(n, v);
          found = true;
        }
        // adder in complete end (add after all others)
        if (id in adders[file]) {
          if (id in lists[file]) {
            const l = await lists[file][id](...args);
            if (!(Symbol.iterator in Object(l))) {
              throw new NullsScriptError(
                "List #" + i + " at " + file + " is not iterable!"
              );
            }
            for (const el of l) {
              const c = await adders[file][id](...args, el);
              element.append(await render(c, ...args, el));
            }
          } else {
            const c = await adders[file][id](...args);
            element.append(await render(c, ...args));
          }
          found = true;
        }
        if (!found) {
          throw new NullsArgumentError(
            "Manually provided invalid null-id #" + i +
            " at " + file
          );
        }
      }
      return html.html();
    }
    res.type("html");
    res.end(await render(options.root, req, res));
  });

  return app.listen(options.port, () => options.ready());
}

module.exports = { nulls, NullsPathError, NullsArgumentError, NullsScriptError };
