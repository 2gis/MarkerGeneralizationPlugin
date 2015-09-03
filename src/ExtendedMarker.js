/**
 * Extended marker:
 * - has options to prevent deletion or hide during generalization
 * - makes use of internal class list being applied to icon node
 */
L.MarkerEx = L.Marker.extend({
    /**
     * If we can use extended powers of current marker.
     */
    _extended: true,


    /**
     * Augment parent method to apply class names when icon is added on map
     * @param map
     */
    onAdd: function (map) {
        L.Marker.prototype.onAdd.apply(this, arguments);

        if (this._immunityLevel == this.IMMUNITY.NO_DELETE) {
            this._icon.style.display = 'block';
        }

        this.classes._addClasses();
    },

    /**
     * Determine removal possibility and hide marker if required.
     * @returns {boolean} If marker should be removed from map
     */
    onBeforeRemove: function() {
        if (this._immunityLevel == this.IMMUNITY.NO_HIDE) {
            return false;
        }

        if (this._immunityLevel == this.IMMUNITY.NO_DELETE) {
            this._icon.style.display = 'none';
            return false;
        }

        return true;
    },

    initialize: function() {
        L.Marker.prototype.initialize.apply(this, arguments);
        this.classes = L.markerClassList(this);
    },

    /**
     * Marker immunity mechanism
     */
    IMMUNITY: {
        NONE: 0, // Simple marker
        NO_DELETE: 1, // Will stay on map during generalization (DOM node of the icon will not be deleted).
        NO_HIDE: 2 // Will not be neither deleted nor hidden during generalization.
    },
    _immunityLevel: null,
    immunifyForDeletion: function() {
        this._immunityLevel = this.IMMUNITY.NO_DELETE;
        return this;
    },
    immunifyForHide: function() {
        this._immunityLevel = this.IMMUNITY.NO_HIDE;
        return this;
    },
    revokeImmunity: function() {
        this._immunityLevel = this.IMMUNITY.NONE;
        return this;
    }
});

L.markerEx = function (latlng, options) {
    return new L.MarkerEx(latlng, options);
};

