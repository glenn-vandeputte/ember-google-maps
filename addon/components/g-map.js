import MapComponent from './g-map/map-component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

import { toLatLng } from '../utils/helpers';

import { waitFor } from '@ember/test-waiters';
import { DEBUG } from '@glimmer/env';
import { deprecate } from '@ember/debug';

function GMapPublicAPI(source) {
  return {
    get map() {
      return source.map;
    },

    get components() {
      return source.deprecatedPublicComponents;
    },
  };
}

export default class GMap extends MapComponent {
  @tracked canvas;

  components = new Set();

  get publicAPI() {
    return GMapPublicAPI(this);
  }

  get map() {
    return this.mapComponent;
  }

  get newOptions() {
    this.options.zoom ??= 15;
    this.options.center ??= toLatLng(this.args.lat, this.args.lng);

    return this.options;
  }

  // TODO: What if canvas is conditional? Render helpers? Promise? Force a
  // visible canvas?
  setup(options, events) {
    let map = new google.maps.Map(this.canvas, this.newOptions);

    this.addEventsToMapComponent(map, events, this.publicAPI);

    if (typeof this.args.onLoad === 'function') {
      deprecate(
        `The \`onLoad\` event has been deprecated. You should replace it with \`onceOnIdle\`.

        If you had the following:

        <GMap @lat={{this.lat}} @lng={{this.lng}} @onLoad={{this.didLoadMap}} />

        Replace it with:

        <GMap @lat={{this.lat}} @lng={{this.lng}} @onceOnIdle={{this.didLoadMap}} />

        `.replace(/^[\s]+/gm, '\n'),
        false,
        {
          id: 'events.onLoad',
          until: '5.0.0',
          for: 'ember-google-maps',
          since: {
            enabled: '4.0.0-beta.8',
          },
        }
      );

      google.maps.event.addListenerOnce(map, 'idle', () => {
        this.args.onLoad(this.publicAPI);
      });
    }

    if (DEBUG) {
      this.pauseTestForIdle(map);
    }

    return map;
  }

  update(map) {
    map.setOptions(this.newOptions);

    if (DEBUG) {
      this.pauseTestForIdle(map);
    }

    return map;
  }

  // Pause tests until map is in an idle state.
  @waitFor
  async pauseTestForIdle(map) {
    await new Promise((resolve) => {
      google.maps.event.addListenerOnce(map, 'idle', () => resolve(map));
    });
  }

  @action
  getCanvas(canvas) {
    this.canvas = canvas;
  }

  @action
  getComponent(component, as = 'other') {
    let storedComponent = { component, as };
    this.components.add(storedComponent);

    this.addToDeprecatedPublicComponents(storedComponent);

    return {
      context: this.publicAPI,
      remove: () => {
        this.components.delete(storedComponent);
        this.removeFromDeprecatedPublicComponents(storedComponent);
      },
    };
  }

  // TODO Deprecate access to this and replace with API methods.
  deprecatedPublicComponents = {};

  addToDeprecatedPublicComponents({ as, component }) {
    if (!(as in this.deprecatedPublicComponents)) {
      this.deprecatedPublicComponents[as] = [];
    }

    this.deprecatedPublicComponents[as].push(component);
  }

  removeFromDeprecatedPublicComponents({ as, component }) {
    let group = this.deprecatedPublicComponents[as];
    let index = group.indexOf(component);

    if (index > -1) {
      group.splice(index, 1);
    }

    // For backwards compatibility, we don't remove the groups when they're
    // empty.
  }
}
