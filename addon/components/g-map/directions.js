import MapComponent, { MapComponentAPI, combine } from './map-component';
import layout from '../../templates/components/g-map/directions';
import { ignoredOptions, parseOptionsAndEvents, watch } from '../../utils/options-and-events';
import { inject as service } from '@ember/service';
import { get, getProperties, setProperties } from '@ember/object';
import { reads } from '@ember/object/computed';
import { A } from '@ember/array';
import { Promise } from 'rsvp';
import { schedule, scheduleOnce } from '@ember/runloop';
import { didCancel, task } from 'ember-concurrency';


export function DirectionsAPI(source) {
  let mapComponentAPI = MapComponentAPI(source);

  return combine(
    mapComponentAPI,
    {
      get directions() {
        return source.directions;
      },

      get waypoints() {
        return source.waypoints;
      },

      actions: {
        route: () => source.route()
      }
    }
  );
}


/**
 * A wrapper for the google.maps.directionsService API.
 *
 * @class Directions
 * @namespace GMap
 * @module ember-google-maps/components/g-map/directions
 * @extends GMap.MapComponent
 */
export default MapComponent.extend({
  googleMapsApi: service(),

  layout,

  _type: 'directions',
  _pluralType: 'directions',

  directionsService: reads('googleMapsApi.directionsService'),

  _optionsAndEvents: parseOptionsAndEvents([...ignoredOptions, 'onDirectionsChanged']),

  _createOptions(options) {
    return {
      ...options,
      ...getProperties(
        this,
        [
          'origin',
          'destination',
          'travelMode',
          'waypoints',
        ]
      ),
    };
  },

  init() {
    this._super(...arguments);

    this.waypoints = A();

    this.publicAPI = DirectionsAPI(this);
  },

  _addComponent(options) {
    return this.route(options);
  },

  _updateComponent(_, options) {
    return this.route(options);
  },

  _didAddComponent() {
    let watched =
      watch(this, {
        'waypoints.[]': () => this._updateOrAddComponent(),
      });

    watched
      .forEach(({ name, remove }) => this._eventListeners.set(name, remove));

    return this._super(...arguments);
  },

  /**
   * Fetch routing information from DirectionsService.
   *
   * @method route
   * @public
   */
  route(options) {
    return new Promise((resolve, reject) => {
      scheduleOnce('afterRender', this, this._performRouteTask, options, resolve, reject);
    });
  },

  _performRouteTask(options, resolve, reject) {
    get(this, 'routeTask').perform(options)
      .then((result) => resolve(result))
      .catch((e) => {
        if (!didCancel(e)) {
          reject(e);
        }
      });
  },

  routeTask: task(function *(options) {
    let directions = yield get(this, 'fetchDirections').perform(options);

    setProperties(this, {
      directions,
      mapComponent: directions
    });

    if (this.onDirectionsChanged) {
      schedule('afterRender', () => this.onDirectionsChanged?.(this.publicAPI));
    }

    return directions;
  }).restartable(),

  fetchDirections: task(function *(options) {
    let directionsService = yield get(this, 'directionsService');

    let request = new Promise((resolve, reject) => {
      directionsService.route(options, (response, status) => {
        if (status === 'OK') {
          resolve(response);
        } else {
          reject(status);
        }
      });
    });

    let directions = yield request;

    return directions;
  }),

  _registerWaypoint(waypoint) {
    schedule('actions', () => {
      get(this, 'waypoints').pushObject(waypoint);
    });
  },

  _unregisterWaypoint(waypoint) {
    schedule('actions', () => {
      get(this, 'waypoints').removeObject(waypoint);
    });
  }
});
