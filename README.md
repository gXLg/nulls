# Nulls
Simple HTML framework for express

# Installation
```
npm install nulls
```

# Idea
Normal tags with parameters, removed on the client
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
* `null-tag` - handler returns name, value; the tag is set on element
* `null-if` - conditional execution
