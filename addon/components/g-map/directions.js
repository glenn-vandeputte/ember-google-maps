import MapComponent, { MapComponentAPI, combine } from './map-component';
import { inject as service } from '@ember/service';
import { action } from '@ember/object';
import { tracked } from '@glimmer/tracking';
import { A } from '@ember/array';
import { Promise, reject } from 'rsvp';
import { schedule } from '@ember/runloop';
import { didCancel, keepLatestTask } from 'ember-concurrency';

export function DirectionsAPI(source) {
  let mapComponentAPI = MapComponentAPI(source);

  return combine(mapComponentAPI, {
    get directions() {
      return source.directions;
    },

    get waypoints() {
      return source.waypoints;
    },

    actions: {
      route: () => source.route(),
    },
  });
}

export default class Directions extends MapComponent {
  @tracked directions = null;

  @service googleMapsApi;

  get waypoints() {
    return [...(this.options.waypoints ?? []), ...this.waypointsToObjects];
  }

  newOptions(options) {
    return {
      ...options,
      waypoints: this.waypoints,
    };
  }

  // We need to explicitly track this, otherwise autotracking doesn’t work.
  // Seems like Ember arrays are a still a bit special.
  @tracked waypointComponents = A([]);

  get waypointsToObjects() {
    return this.waypointComponents.map((waypoint) => {
      return { location: waypoint.location };
    });
  }

  new(options) {
    return this.route(options)
      .then((directions) => {
        this.directions = directions;

        this.events.onDirectionsChanged?.(this.publicAPI);
      })
      .catch((e) => {
        if (!didCancel(e)) {
          return reject(e);
        }
      });
  }

  route(options) {
    return this.fetchDirections.perform(options);
  }

  @keepLatestTask
  *fetchDirections(options = {}) {
    let directionsService = yield this.googleMapsApi.directionsService;

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
  }

  @action
  getWaypoint(waypoint) {
    schedule('actions', () => {
      this.waypointComponents.pushObject(waypoint);
    });

    return () => this.removeWaypoint(waypoint);
  }

  removeWaypoint(waypoint) {
    schedule('actions', () => {
      this.waypointComponents.removeObject(waypoint);
    });
  }
}
