import ExtendedMarker from './ExtendedMarker'; // Какого чОрта? @todo Вытащить в online, тут это не нужно
import MarkerGeneralizeGroup from './Generalize';

export default function extendLeaflet() {
    L.markerEx = function(latlng, options) {
        return new ExtendedMarker(latlng, options);
    };

    L.markerGeneralizeGroup = function(option) {
        return new MarkerGeneralizeGroup(option);
    };
}
