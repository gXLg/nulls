# Nulls
Simple HTML framework for express

# Installation
```
npm install nulls
```

# Idea

![nulls drawio](https://github.com/user-attachments/assets/bfdc1b87-450e-481b-9e90-964c605b678a)


Normal tags with parameters, removed on the client.

Internal handlers receive: request to parse cookies or path

* `null-container` - insert HTML into element
  * `null-list` - iterate over something and make
    a total html out of it; all further handlers
    will be passed an additional argument: the current item
    of the iterable; arguments persist to next levels
* `null-adder` - add HTML to the element (useful for SEO)
  * `null-list` - iterate and add
* `null-data` - server-side data retrieval (useful for title and other placeholders)
* `null-api` - form (or button) with the parameter
  * `null-upload` - additional parameter to parse files server-side
  * `null-access` - additional parameter to verify the API endpoint is called correctly (or else Error 403)
* `null-attr` - handler returns name-value object; the attributes are set on element
* `null-if` - conditional execution

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
