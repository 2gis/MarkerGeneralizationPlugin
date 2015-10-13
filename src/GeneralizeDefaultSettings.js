L.MarkerGeneralizeGroupDefaults = {
    chunkSize: 20,
    levels: [
        {
            margin: 30,
            safeZone: 20,
            size: [25, 40],
            offset: [12.5, 40],
            className: '_pin'
        },
        {
            safeZone: 5,
            size: [6, 6],
            className: '_bullet'
        },
        {
            safeZone: 0,
            className: '_hidden'
        }
    ],
    // In parts of viewport size.
    // 1 means there will be 1 screen in all directions of unhidden markers around the viewport.
    // 0.5 means there will be a half of the screen in all directions of unhidden markers around the viewport.
    viewportHideOffset: 1,
    checkMarkersIntersection: function(currentMarker, checkingMarker) {
        var distance = Math.max(currentMarker.safeZone, checkingMarker.margin);
        return Math.abs(currentMarker.markerX - checkingMarker.markerX) > (distance + currentMarker.markerWidth / 2 + checkingMarker.markerWidth / 2) ||
            Math.abs(currentMarker.markerY - checkingMarker.markerY) > (distance + currentMarker.markerHeight / 2 + checkingMarker.markerHeight / 2);
    },
    checkMarkerMinimumLevel: function() {
        return 0;
    },

    // by default Layer has overlayPane, but we work with markers
    pane: 'markerPane',
    getMarkerFields: function() {
        return [];
    },
    getMarkerId: function(marker) {
        return marker.id;
    }
};
