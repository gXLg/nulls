async function request(path, fd, json = false) {
  const r = await fetch(path, {
    "method": "POST",
    "body": fd
  });
  return json ? await r.json() : await r.text();
}

const cacheNulls = {};
const cacheNullRequests = {};
async function getNull(p, type) {
  const path = p + "/" + type;
  if (path in cacheNulls) return cacheNulls[path];
  if (path in cacheNullRequests) return cacheNullRequests[path];
  const pr = new Promise(async resolve => {
    const r = await fetch("/static/nulls/" + path + ".html");
    const t = await r.text();
    resolve(t);
    cacheNulls[path] = t;
    delete cacheNullRequests[path];
  });
  cacheNullRequests[path] = pr;
  return pr;
}

const cacheParsers = {};
const cacheParserRequests = {};
async function getParser(path) {
  if (path in cacheParsers) return cacheParsers[path];
  if (path in cacheParserRequests) return cacheParserRequests[path];
  const pr = new Promise(async resolve => {
    const r = await fetch("/static/parsers/" + path + ".js");
    const t = eval(await r.text());
    resolve(t);
    cacheParsers[path] = t;
    delete cacheParserRequests[path];
  });
  cacheParserRequests[path] = pr;
  return pr;
}

async function getData(path, tracker) {
  const t = await request("/null-data/" + path, tracker, true);
  const parser = await getParser(path);
  return await parser(t);
}

const cacheHandlers = {};
const cacheHandlerRequests = {};
async function getHandler(path) {
  if (path in cacheHandlers) return cacheHandlers[path];
  if (path in cacheHandlerRequests) return cacheHandlerRequests[path];
  const pr = new Promise(async resolve => {
    const r = await fetch("/static/handlers/" + path + ".js");
    const t = eval(await r.text());
    resolve(t);
    cacheHandlers[path] = t;
    delete cacheHandlerRequests[path];
  });
  cacheHandlerRequests[path] = pr;
  return pr;
}

async function handleRequest(path, tracker) {
  const answer = await request("/null-request/" + path, tracker, true);
  const handler = await getHandler(path);
  handler(answer);
}

async function handleLoader(path, tracker, loader) {
  // last performed index
  const i = loader.getAttribute("null-index") ?? -1;
  tracker.append("index", i);
  const index = await request("/null-load/" + path, tracker);
  if (index != "") loader.setAttribute("null-index", index);
  return index;
}

const cacheDummies = {};
const cacheDummyRequests = {};
async function getDummy(path) {
  if (path in cacheDummies) return cacheDummies[path];
  if (path in cacheDummyRequests) return cacheDummyRequests[path];
  const pr = new Promise(async resolve => {
    const r = await fetch("/static/dummies/" + path + ".html");
    const t = await r.text();
    resolve(t);
    cacheDummies[path] = t;
    delete cacheDummyRequests[path];
  });
  cacheDummyRequests[path] = pr;
  return pr;
}

function collectTrackers(pathStack, data) {
  const fd = new FormData();
  fd.append("path", window.location.pathname);
  fd.append("search", window.location.search);
  if (!data.hasAttribute("null-tracks")) return fd;
  const trackers = data.getAttribute("null-tracks").split(/,[ ]*/);
  for (const name of trackers) {
    let found = false;
    for (const element of pathStack) {
      const track = element.getAttribute("null-tracker") == name ? element : element.querySelector("[null-tracker=" + name + "]");
      if (track == null) continue;
      const tagName = track.tagName.toLowerCase();
      found = true;
      if (tagName == "null-data") {
        fd.append(name, track.innerText.trim());
      } else if (tagName == "textarea") {
        fd.append(name, track.value);
      } else if (tagName == "input" && track.type == "file") {
        for (const file of track.files) {
          fd.append(name, file);
        }
      } else if (tagName == "input" && track.type == "text" || track.type == "password") {
        fd.append(name, track.value);
      } else if (tagName == "null-container") {
        fd.append(name, track.getAttribute("null-element"));
      } else {
        found = false;
        continue;
      }
      break;
    }
    if (!found) {
      console.error("Could not load tracker '" + name + "' for ", data);
      throw new Error("Could not load tracker");
    }
  }
  return fd;
}

const cache = {};
async function handleData(data, ppath, tracker, force) {
  const nul = data.getAttribute("null");
  const path = ppath + "/" + nul;
  if (data.hasAttribute("null-cache")) {
    const hash = await request("/null-validator/" + path, tracker);
    if (!(hash in cache)) {
      const html = await getData(path, tracker);
      cache[hash] = html;
    }
    data.innerHTML = cache[hash];
  } else {
    data.innerHTML = await getData(path, tracker);
  }
}

const currentTypes = {};
async function handleNulls(p = "root", force = false) {
  let element = document.body;
  const pathStack = [element];
  const lp = [];
  for (const part of p.split("/")) {
    if (part.includes(".")) {
      const [b, e] = part.split(".");
      element = element.querySelector("null-container[null=" + b + "][null-element='" + e + "']");
      lp.push(b);
    } else {
      element = element.querySelector("null-container[null=" + part + "]");
      lp.push(part);
    }
    if (element == null) return;
    pathStack.unshift(element);
  }
  const path = lp.join("/");
  const tracker = collectTrackers(pathStack, element);

  let type;
  if (element.hasAttribute("null-title")) {
    const [a, b] = await request("/null-container/" + path, tracker, true);
    type = a;
    document.title = b;
  } else {
    type = await request("/null-container/" + path, tracker);
  }
  if (currentTypes[p] != type || force) {
    currentTypes[p] = type;
    element.innerHTML = await getNull(path, type);
    // remove cached types of sub containers (since they are gone)
    for (const pp in currentTypes) {
      if (pp.startsWith(p) && pp != p) {
        delete currentTypes[pp];
      }
    }
    for (const data of element.querySelectorAll("null-data:not([null-refresh])")) {
      const tracker = collectTrackers(pathStack, data);
      await handleData(data, path, tracker, force);
    }
  }
  for (const data of element.querySelectorAll("null-data[null-refresh]")) {
    if (data.closest("null-container") != element) continue;
    const tracker = collectTrackers(pathStack, data);
    await handleData(data, path, tracker, force);
  }
  element.classList.remove("null-awaiting");

  for (const container of element.querySelectorAll("null-container:not(.null-awaiting)")) {
    if (container.parentNode.closest("null-container") != element) continue;
    const nul = container.getAttribute("null");
    container.classList.add("null-awaiting");
    (new IntersectionObserver((es, obs) => {
      for (const e of es) {
        if (e.intersectionRatio > 0) {
          obs.disconnect();
          handleNulls(path + "/" + nul, force);
          return;
        }
      }
    }).observe(container));
  }

  for (const link of element.querySelectorAll("[null-link]")) {
    if (link.closest("null-container") != element) continue;
    link.onclick = event => {
      event.preventDefault();
      navigate(link.href);
    };
  }

  for (const req of element.querySelectorAll("null-request")) {
    if (req.closest("null-container") != element) continue;
    const nul = req.getAttribute("null");
    req.onclick = async event => {
      event.preventDefault();
      const tracker = collectTrackers(pathStack, req);
      handleRequest(path + "/" + nul, tracker);
    };
  }

  for (const loader of element.querySelectorAll("null-loader")) {
    if (loader.closest("null-container") != element) continue;
    const nul = loader.getAttribute("null");
    const loads = loader.getAttribute("null-loads");
    const after = loader.hasAttribute("null-after");
    function listen() {
      (new IntersectionObserver(async (es, obs) => {
        for (const e of es) {
          if (e.intersectionRatio > 0) {
            obs.disconnect();
            const tracker = collectTrackers(pathStack, loader);
            const index = await handleLoader(path + "/" + nul, tracker, loader);
            if (index != "") {
              await insertDummy(loads, index, loader, after, path);
              listen();
            }
            return;
          }
        }
      }).observe(loader));
    }
    listen();
  }
}

function navigate(href) {
  window.history.pushState(null, document.title, href);
  handleNulls();
}

window.onload = () => handleNulls();
window.onpopstate = () => handleNulls();

async function insertDummy(nul, element, anchor, after, path) {
  const c = document.createElement("div");
  const d = await getDummy(path + "/" + nul);
  c.innerHTML = d;
  const dummy = c.querySelector("null-container");
  dummy.setAttribute("null-element", element);
  dummy.classList.add("null-awaiting");

  if (after) {
    anchor.parentNode.insertBefore(dummy, anchor.nextSibling);
  } else {
    anchor.parentNode.insertBefore(dummy, anchor);
  }

  const p = path + "/" + nul + "." + element;
  handleNulls(p);
}
