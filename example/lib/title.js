module.exports = (path, auth) => {
  if (path == "/") return "Null Chat";
  if (path == "/chat") return "Null Chat - Chatting";
  if (path == "/login") return "Null Chat - Login";
  if (path == "/register") return "Null Chat - Register";
  if (path.startsWith("/chat/")) {
    if (!auth) return "Null Chat";
    const [empty, chat, id, ...x] = path.split("/");
    if (x.length || !id.match(/^[a-z0-9_]+$/i)) "Null Chat";
    return "Null Chat - " + id;
  }
  return "Null Chat";
};
