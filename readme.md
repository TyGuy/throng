# Throng

Dead-simple one-liner for clustered apps.

Runs X workers and respawns them if they go down.
Correctly handles signals from the OS.

```js
const throng = require('throng');

throng(3, (id) => {
  console.log(`Started worker ${id}`);
});
```

```
$ node example
Started worker 1
Started worker 2
Started worker 3
```

## Installation

```
npm install --save throng
```

For older versions of node (< 4.x), use throng 2.x.

## Use

```js
throng(workers, startFunction);
```

Alternatively:

```js
throng(optionsObject, startFunction);
```

## All Options (with defaults)

```js
throng({
  workers: 4,       // Number of workers (1)
  lifetime: 10000,  // ms to keep cluster alive (Infinity)
  grace: 4000       // ms grace period after worker SIGTERM (5000)
}, startFn);
```

## Tests

```
npm test
```
