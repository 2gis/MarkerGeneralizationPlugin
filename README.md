MarkerGeneralizationPlugin
==========================

Provides marker generalization for 2gis maps API and Leaflet.

## Using the plugin


Add plugin script after map library. For 2gis maps API you can use external modules system.

```javascript

DG.then(function() {
    // module load
    return DG.plugin('https://github.com/2gis/MarkerGeneralizationPlugin/raw/master/dist/generalize.min.js');
}).then(function() {
    map = DG.map('map', {
        center: DG.latLng(54.92, 82.82),
        zoom: 9
    });
    var markerGroup = DG.markerGeneralizeGroup();
    var markers = [];
    // making new markers from coords list
    for (var i = 0; i < coordsList.length; i++) {
        var c = coordsList[i];
        var marker = DG.marker([c[0], c[1]]);
        markers.push(marker);
    }
    // for big massive of markers it's better to add them all to group in one time
    markerGroup.addLayers(markers);
    map.addLayer(markerGroup);
});

```

### Options

Example of options with default params and comments:

```javascript

var options = {
        // types of markers by priority
        levels: [
            {
                // minimum pixels from current marker to another marker higher or this level
                safeZone: 20,
                // minimum pixels from current marker to another marker lower or this level
                margin: 30,
                // size of current marker
                size: [25, 40],
                // offset for center of current marker
                offset: [12.5, 40],
                // class name for markers at this level
                className: '_pin'
            },
            {
                safeZone: 5,
                size: [6, 6],
                className: '_bullet'
            },
            {
                // no size - it will be hidden marker no checks after this level
                safeZone: 0,
                className: '_hidden'
            }
        ],
        // function to check if current marker intersect testing marker
        // currentMarker, checkingMarker have this list of attributes:
        //      x, y - marker center coordinates in pixels for checking zoom (calculate from real coordinates and offset)
        //      width, height - size of marker
        //      safeZone - safeZone from marker level
        // returns {Boolean}
        checkMarkersIntersection: function(currentMarker, checkingMarker) {
            var safeZone = Math.min(currentMarker.safeZone, checkingMarker.safeZone);
            var distance = Math.max(safeZone, checkingMarker.margin);
            return Math.abs(currentMarker.x - checkingMarker.x) > (distance + currentMarker.width / 2 + checkingMarker.width / 2)
                || Math.abs(currentMarker.y - checkingMarker.y) > (distance + currentMarker.height / 2 + checkingMarker.height / 2);
        },
        // function to detect minimum level for this marker
        // marker - marker that user created
        // returns {Number}, index of minimum level from levels array
        checkMarkerMinimumLevel: function(marker) {
            return 0;
        }
    }
```

### Methods

**addLayers(array)** - adds list of markers to the group

Also group supports all methods of [FeatureGroup](http://api.2gis.ru/doc/maps/manual/groups/#класс-dgfeaturegroup).

### Events

**invalidationFinish** - fired when the group finished invalidating markers (set all the class names)

Also group supports all events of [FeatureGroup](http://api.2gis.ru/doc/maps/manual/groups/#класс-dgfeaturegroup).
