'use strict';
const { EventEmitter } = require('node:events');
const Module = require('node:module');
const app = new EventEmitter(); app.ready = false; app.isReady = () => app.ready;
app.whenReady = () => app.ready ? Promise.resolve() : new Promise(resolve => app.once('ready', resolve));
const load = Module._load;
Module._load = function (name, ...args) { return name === 'electron' ? { app } : load.call(this, name, ...args); };
process.type = 'browser';
globalThis.fixtureElectron = { app };
