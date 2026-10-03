'use strict';
const { parentPort } = require('node:worker_threads');
parentPort.postMessage({ markdown: 'wrong shape' });
