# Nulls
Simple HTML framework for express

# Installation
```
npm install nulls
```

# Structure
![nulls drawio](https://github.com/user-attachments/assets/bfdc1b87-450e-481b-9e90-964c605b678a)

The `nulls` framework is a wrapper around `express.js`
and other useful modules with the goal of making the process of
developing websites quicker and easier.

This framework offers a wide range of configuration
options while making everything as secure as possible.

* Highly configurable framework
* Very adaptive server-side rendering engine
* Simple dynamic HTML structure

# HTML
Writing dynamic HTML was never as easy as with `nulls`!

The HTML files are being parsed on the server using `cheerio`,
making DOM modifications simple and intuitive.

`nulls` adds a couple of custom HTML attributes,
which are parsed on the server and removed completely
on the client. Internal handlers receive the request object
with parsed cookies, and additional arguments if provided.

Since internal handlers are executed directly in the framework,
it is super easy to integrate modular logic, and you don't have
to learn "yet another rendering language™" -
use the all beloved JavaScript.

* `null-container` - replace HTML in the element
  * `null-list` - iterate over something and make
    a total html out of it; all further handlers
    will be passed an additional argument: the current item
    of the iterable; arguments persist to next levels
* `null-adder` - add HTML to the element (useful for SEO in e.g. `<head>`)
  * `null-list` - iterate and add
* `null-data` - server-side data retrieval (useful for title and other placeholders)
* `null-api` - form (or button) with the parameter
  * `null-upload` - additional parameter to parse files server-side
  * `null-access` - additional parameter to verify the API endpoint is called with correct permissions (or else Error 403)
  * `null-ajax` - additional parameter to add client-side processing of an API request
* `null-attr` - handler returns name-value object; the attributes are set on element
* `null-if` - conditional execution
* `null-arg` - pass an additional argument to all handlers on the element

Example:

> `root.html`
```html
<ul null-list="() => [{ 'v': 46 }, { 'v': 69, }, { 'v': 83 }]" null-adder="#partials/list-item.html">
</ul>
```

> `partials/list-item.html`
```html
<li null-data>
 <script null-data>
  const calculate = require("./lib/math.js");
  return async (r, s, d) => {
    const value = d.v;
    return await calculate(value);
  };
 </script>
</li>
```

Result on the client:
```html
<ul>
  <li>1081</li>
  <li>2415</li>
  <li>3486</li>
</ul>
```

# Configuration

Here's a brief overview of all configs
available at creation of a `nulls` instance.

* `uploads` - `false` or a path to the uploads folder
* `uploadLimit` - `false` or a total limit for one
  API request with files attached
* `forceHTTPS` - whether to redirect the clients to HTTPS
* `init` - a function which receives the express app
  * Executed before any logic is added to the app by the framework
  * Useful for custom rate-limiting, blacklisting logic etc.
* `hook` - a function which is called on every request except the `HEAD` request
  * Useful for authentication (see the official [<kbd>auth</kbd>](https://github.com/gXLg/nulls-auth) plugin)
* `nulls` - the folder where all HTML files are stored
* `root` - the name of the "root HTML file" relative to `nulls`
* `static` - `false` or a path to statically served files
* `port` - the local port to host the website
  * Usually an automatically assigned port by the hosting software
* `ready` - a callback for when the server is up and running
* `preprocessor` - function to pre-process every single HTML chunk
* `postprocessor` - function to post-process the result as HTML
* `textprocessor` - function to post-process the result as raw text
* `srcProviders` - lookup for custom source/script providers
  * Mainly used by plugins
* `plugins` - an array of config modifying functions
* `domain` - the host name ofnyour website
  * Used in security options such as CORS and HTTPS redirects
* `redirects` - lookup for HTML redirects
  * Since the framework uses `sameorigin` policy,
    authentication may not work when landing on your website
    from an external provider
* `proxies` - passed to `app.set('trust proxy', proxies)` in order
  to securely process IP adresses
  * Useful for reverse proxies such as cloudflared tunnel
