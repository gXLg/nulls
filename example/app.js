const { nulls } = require("..");

nulls({
  "nulls": "./null",
  "static": "files",
  "ready": () => console.log("Up!")
});
