const cluster = require('cluster');
const EventEmitter = require('events').EventEmitter;
const defaults = require('lodash.defaults');
const cpuCount = require('os').cpus().length;

const DEFAULT_OPTIONS = {
  workers: cpuCount,
  lifetime: Infinity,
  failureTolerance: Infinity,
  grace: 5000
};

const NOOP = () => {};

// key: workerId (created by node)
// value: workerTypeIndex (decided by us) -- the index that represents the type of worker
const workerIds = {}

const workerNumbersByType = []

const failuresByType = {}

module.exports = function throng(options, startFunction) {
  // if (cluster.isMaster) {
  //   console.log('I am master')
  // } else {
  //   console.log(`I am worker. My ID is ${cluster.worker.id}, my WORKER_TYPE_INDEX is ${process.env.WORKER_TYPE_INDEX}`)
  // }

  options = options || {};

  let startFn = options.start || startFunction || options;
  if (multipleWorkerTypes() && cluster.isWorker) {
    startFn = options.workers[process.env.WORKER_TYPE_INDEX].start
  }

  let masterFn = options.master || NOOP;

  const startShouldBeDefined = cluster.isWorker || !multipleWorkerTypes()

  if (typeof startFn !== 'function' && startShouldBeDefined) {
    throw new Error('Start function required');
  }
  if (cluster.isWorker) {
    const instanceId = process.env.INSTANCE_ID
    return startFn(instanceId);
  }

  let opts = isNaN(options) ?
    defaults(options, DEFAULT_OPTIONS) : defaults({ workers: options }, DEFAULT_OPTIONS);
  let emitter = new EventEmitter();
  let running = true;
  let runUntil = Date.now() + opts.lifetime;

  let failureTolerance = opts.failureTolerance
  console.log(`failureTolerance: ${failureTolerance}`)

  listen();
  masterFn(cluster);
  fork();

  function forkMultiple() {
    for (let i = 0; i < opts.workers.length; i++) {
      workerNumbersByType[i] = {}

      const _numWorkers = numWorkers(i)
      for (var j = 1; j <= _numWorkers; j++) {
        forkOne(i, j)
      }
    }
  }

  function forkOne(workerTypeIndex, instanceId, failureCount = 0) {
    const env = { WORKER_TYPE_INDEX: workerTypeIndex, INSTANCE_ID: instanceId, PROCESS_FAILURE_COUNT: failureCount }

    if (typeof failuresByType[workerTypeIndex] === 'undefined') {
      failuresByType[workerTypeIndex] = 0
    } else {
      failuresByType[workerTypeIndex] += 1
    }

    const worker = cluster.fork(env)

    workerIds[worker.id] = workerTypeIndex
    workerNumbersByType[workerTypeIndex][worker.id] = instanceId

  }


  function multipleWorkerTypes() {
    return options.workers && Array.isArray(options.workers)
  }


  // this only used if multipleWorkerTypes is true, so
  // could be simplified
  function numWorkers(index) {
    if (!isNaN(options)) { return options }
    if (!(options.workers)) { return undefined }
    return isNaN(options.workers) ? options.workers[index].numWorkers : workers
  }

  function listen() {
    cluster.on('exit', revive);
    emitter.once('shutdown', shutdown);
    process
      .on('SIGINT', proxySignal)
      .on('SIGTERM', proxySignal);
  }

  function fork() {
    (multipleWorkerTypes()) ? forkMultiple() : forkSimple()
  }

  function forkSimple() {
    for (var i = 0; i < opts.workers; i++) {
      cluster.fork();
    }
  }

  function proxySignal() {
    emitter.emit('shutdown');
  }

  function shutdown() {
    running = false;
    for (var id in cluster.workers) {
      cluster.workers[id].process.kill();
    }
    setTimeout(forceKill, opts.grace).unref();
  }

  function revive(worker, code, signal) {
    const workerTypeIndex = workerIds[worker.id]
    delete workerIds[worker.id]

    const instanceId = workerNumbersByType[workerTypeIndex][worker.id]
    delete workerNumbersByType[workerTypeIndex][worker.id]

    const failureCount = failuresByType[workerTypeIndex]

    if (running && Date.now() < runUntil) {

      if (failuresByType[workerTypeIndex] <= failureTolerance) {
        forkOne(workerTypeIndex, instanceId, failureCount);
      } else {
        console.log(`above failure tolerance ${failureTolerance} for workerTypeIndex ${workerTypeIndex}; not restarting worker.`)
        shutdown()
      }
    }
  }

  function forceKill() {
    for (var id in cluster.workers) {
      cluster.workers[id].kill();
    }
    process.exit();
  }
};
