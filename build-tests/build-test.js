'use strict';

const path = require('path');
const chalk = require('chalk');
const AddonTestApp = require('ember-cli-addon-tests').AddonTestApp;

// Set up Google Maps key
const dotenvConf = require('../config/dotenv')('development');
require('dotenv').config(dotenvConf);

const log = (msg) => console.log(chalk.green(msg));
const debug = (msg) => console.log(chalk.gray(msg));

function prepareOptions(options = {}) {
  return Object.entries(options)
    .reduce((acc, v) => acc.concat(v), []) // .flat()
    .map((v,i) => (i % 2 === 0) ? '--' + v : v)
}

async function createApp(appName) {
  log('Creating app...');

  let app = new AddonTestApp();

  await app.create(appName, {
    emberVersion: '~3.22.0',
    fixturesPath: 'build-tests/fixtures/',
    log: debug,
  });

  return app;
}

async function buildApp(app, options = {}) {
  log('Building app...');

  let buildOptions = prepareOptions(options);

  await app.runEmberCommand('build', ...buildOptions, { log: debug });

  return app;
}

async function testCI(app, options = {}) {
  log('Running test suite...');

  let distPath = path.resolve(app.path, 'dist'),
      testPage = path.resolve(distPath, 'tests/index.html');

  debug(`Serving from: ${distPath}`);

  let testOptions = prepareOptions(options);
  await app.runEmberCommand(
    'test',
    ...testOptions,
    '--path',
    distPath,
    '--test-page',
    testPage,
    { log: console.log }
  );

  return app;
}

async function runTests() {
  let app = await createApp('treeshaking-test');

  await buildApp(app, { environment: 'test' });
  
  await testCI(app);
}

runTests();
