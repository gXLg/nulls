const nulls = require("..");

const title = require("./lib/title.js");

(async () => {

  // simple static credentials
  const users = { "token1": "gXLg", "token2": "MrAnonymous" };

  await nulls({
    "hook": async req => {
      const token = req.cookies.token;
      if (token in users) req.auth = users[token];
      else req.auth = null;
    },
    "ready": () => {
      console.log("Server up!");
    },
    "seo": req => {
      const path = req.path;
      return "<title>" + title(path, null) + "</title>";
    }
  });

})();
