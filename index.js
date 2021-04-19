/* eslint-disable prefer-template */

'use strict';

const Funnel = require('broccoli-funnel');
const chalk = require('chalk');
const BroccoliDebug = require('broccoli-debug');
const camelCase = require('camelcase');

const lite = require('caniuse-lite');
const browserslist = require('browserslist');

function canIUseProxy(targets = {}) {
  let compatTable = lite.feature(lite.features['proxy']).stats;

  let browsers = browserslist(targets.browsers);

  let compat = browsers.map((browser) => {
    let parts = browser.split(' ');
    let nestedPath = compatTable;

    for (let part of parts) {
      nestedPath = nestedPath[part];
    }

    return nestedPath;
  });

  return compat.every((x) => x === 'y');
}

const {
  newIncludedList,
  newExcludedList,
  newExcludeName,
  newExcludeComponent,
  skipTreeshaking,
} = require('./lib/treeshaking');

let dependencies = {
  circle: ['marker'],
};

let FOUND_GMAP_ADDONS = {};

let PARAMS_FOR_TREESHAKER = {
  included: null,
  excluded: null,
  isProduction: true,
};

module.exports = {
  name: require('./package').name,

  options: {
    '@embroider/macros': {
      setOwnConfig: {
        // hasNativeProxy: false,
      },
    },
    babel: {
      plugins: [
        '@babel/plugin-proposal-logical-assignment-operators',
        '@babel/plugin-proposal-object-rest-spread',
        '@babel/plugin-proposal-optional-chaining',
      ],
    },
  },

  setBuildMacro(key, value) {
    this.options['@embroider/macros'].setOwnConfig[key] = value;
  },

  init() {
    this._super.init.apply(this, arguments);
    this.debugTree = BroccoliDebug.buildDebugCallback(
      `ember-google-maps:${this.name}`
    );
  },

  included() {
    this._super.included.apply(this, arguments);

    let app = this._findHost(),
      config = app.options['ember-google-maps'] || {};

    this.isProduction = app.isProduction;
    this.isDevelopment = !this.isProduction;

    // this.setBuildMacro('hasNativeProxy', canIUseProxy(this.project.targets));
    // this.options['@embroider/macros'].setOwnConfig.hasNativeProxy = canIUseProxy(this.project.targets);

    // Treeshaking setup

    let { only = [], except = [] } = config;

    only = only.map(camelCase);
    except = except.map(camelCase);

    let included = newIncludedList(only, except),
      excluded = newExcludedList(only, except);

    if (this.isProduction) {
      excluded.push('warnMissingComponent');
    }

    // Include the base map components and any dependencies
    if (included.length) {
      included.push('canvas', 'mapComponent');

      if (this.isDevelopment) {
        included.push('warnMissingComponent');
      }

      included.forEach((name) => {
        let deps = dependencies[name];

        if (deps) {
          included = included.concat(deps);
        }
      });
    }

    // Excluded components that depend on excluded ones
    if (excluded.length) {
      excluded.forEach((name) => {
        Object.entries(dependencies).forEach(([dependant, dependencies]) => {
          if (dependencies.includes(name)) {
            excluded.push(dependant);
          }
        });
      });
    }

    this.excludeName = newExcludeName(included, excluded);
    this.excludeComponent = newExcludeComponent(included, excluded);

    this.skipTreeshaking = skipTreeshaking(included, excluded);

    // Save treeshaking params for Babel
    Object.assign(PARAMS_FOR_TREESHAKER, {
      included: included,
      excluded: excluded,
      isProduction: this.isProduction,
    });

    // Get “addons for this addon”™️
    Object.assign(FOUND_GMAP_ADDONS, this.getAddonsFromProject(this.project));
  },

  config(env, config) {
    let mapConfig = config['ember-google-maps'] || {};
    mapConfig['src'] = this.buildGoogleMapsUrl(mapConfig);

    return { 'ember-google-maps': mapConfig };
  },

  treeForAddon(tree) {
    tree = this.debugTree(tree, 'addon-tree:input');

    tree = this.filterComponents(tree);
    tree = this.debugTree(tree, 'addon-tree:post-filter');

    // Run super now, which processes and removes `.hbs`` template files.
    tree = this._super.treeForAddon.call(this, tree);
    tree = this.debugTree(tree, 'addon-tree:post-super');

    return tree;
  },

  setupPreprocessorRegistry(type, registry) {
    let canvasPlugin = this._canvasBuildPlugin();

    registry.add('htmlbars-ast-plugin', canvasPlugin);

    // These should only run on this addon (self), but they rely on data from
    // the parent app.
    // if (type === 'self') {
    //   let addonFactoryPlugin = this._addonFactoryPlugin();
    //   registry.add('htmlbars-ast-plugin', addonFactoryPlugin);

    //   let treeshakerPlugin = this._treeshakerPlugin();
    //   registry.add('htmlbars-ast-plugin', treeshakerPlugin);
    // }
  },

  _addonFactoryPlugin({ addons } = {}) {
    const AddonFactory = require('./lib/ast-transforms/addon-factory')(addons);

    return {
      name: 'ember-google-maps:addon-factory',
      plugin: AddonFactory,
      baseDir() {
        return __dirname;
      },
      parallelBabel: {
        requireFile: __filename,
        buildUsing: '_addonFactoryPlugin',
        params: { addons: FOUND_GMAP_ADDONS },
      },
    };
  },

  _treeshakerPlugin(params = {}) {
    const Treeshaker = require('./lib/ast-transforms/treeshaker')(params);

    return {
      name: 'ember-google-maps:treeshaker',
      plugin: Treeshaker,
      baseDir() {
        return __dirname;
      },
      parallelBabel: {
        requireFile: __filename,
        buildUsing: '_treeshakerPlugin',
        params: PARAMS_FOR_TREESHAKER,
      },
    };
  },

  _canvasBuildPlugin() {
    return {
      name: 'ember-google-maps:canvas-enforcer',
      plugin: require('./lib/ast-transforms/canvas-enforcer'),
      baseDir() {
        return __dirname;
      },
      parallelBabel: {
        requireFile: __filename,
        buildUsing: '_canvasBuildPlugin',
        params: {},
      },
    };
  },

  getAddonsFromProject(project) {
    const AddonRegistry = require('./lib/addons/registry');

    return new AddonRegistry(project).components;
  },

  filterComponents(tree) {
    if (this.skipTreeshaking) {
      return tree;
    }

    return new Funnel(tree, {
      exclude: [this.excludeComponent],
    });
  },

  buildGoogleMapsUrl(config = {}) {
    let {
      baseUrl = '//maps.googleapis.com/maps/api/js',
      channel,
      client,
      key,
      language,
      libraries,
      protocol,
      region,
      version,
      mapIds,
    } = config;

    if (!key && !client) {
      // Since we allow configuring the URL at runtime, we don't throw an error
      // here.
      return '';
    }

    if (key && client) {
      this.warn(
        'You must specify either a Google Maps API key or a Google Maps Premium Plan Client ID, but not both. Learn more: https://ember-google-maps.sandydoo.me/docs/getting-started'
      );
    }

    if (channel && !client) {
      this.warn(
        'The Google Maps API channel parameter is only available when using a client ID, not when using an API key. Learn more: https://ember-google-maps.sandydoo.me/docs/getting-started'
      );
    }

    let src = baseUrl,
      params = [];

    if (version) {
      params.push('v=' + encodeURIComponent(version));
    }

    if (client) {
      params.push('client=' + encodeURIComponent(client));
    }

    if (channel) {
      params.push('channel=' + encodeURIComponent(channel));
    }

    if (libraries && libraries.length) {
      params.push('libraries=' + encodeURIComponent(libraries.join(',')));
    }

    if (region) {
      params.push('region=' + encodeURIComponent(region));
    }

    if (language) {
      params.push('language=' + encodeURIComponent(language));
    }

    if (key) {
      params.push('key=' + encodeURIComponent(key));
    }

    if (mapIds) {
      params.push('map_ids=' + encodeURIComponent(mapIds));
    }

    if (protocol) {
      src = protocol + ':' + src;
    }

    src += '?' + params.join('&');

    return src;
  },

  warn(message) {
    this.ui.writeLine(chalk.yellow(message));
  },
};
