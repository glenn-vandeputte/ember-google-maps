import TypicalMapComponent from './typical-map-component';
import { toLatLng } from '../../utils/helpers';

export default class Marker extends TypicalMapComponent {
  get name() {
    return 'markers';
  }

  get newOptions() {
    this.options.position ??= toLatLng(this.args.lat, this.args.lng);

    return this.options;
  }

  fresh(options = {}) {
    return new google.maps.Marker(options);
  }
}
