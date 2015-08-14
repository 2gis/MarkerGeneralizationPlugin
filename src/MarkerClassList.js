/**
 * Icon internal classes mechanism
 * Adds possibility to assign css classes to icon even if it is not rendered (yet).
 * Classes will be assigned to icon when it is rendered.
 */
L.MarkerClassList = function(marker) {
    this._classList = {};
    this._marker = marker;
};

L.Util.extend(L.MarkerClassList.prototype, {
    add: function(className) {
        this._classList[className] = 1;
        if (this._marker._icon) {
            L.DomUtil.addClass(this._marker._icon, className);
        }
        return this;
    },
    remove: function(className) {
        delete this._classList[className];
        if (this._marker._icon) {
            L.DomUtil.removeClass(this._marker._icon, className);
        }
        return this;
    },
    contains: function(className) {
        return !!this._classList[className];
    },
    clear: function() {
        this._classList = {};
        if (!this._marker._icon) {
            return;
        }
        for (var className in this._classList) {
            L.DomUtil.removeClass(this._marker._icon, className);
        }
    },
    toString: function() {
        if (Object.keys) {
            return Object.keys(this._classList).join(' ');
        } else {
            var classList = '';
            for (var i in this._classList) {
                classList += i +' ';
            }
        }
    },
    _addClasses: function() {
        if (!this._marker._icon) {
            return;
        }
        for (var className in this._classList) {
            L.DomUtil.addClass(this._marker._icon, className);
        }
    }
});

L.markerClassList = function (marker) {
    return new L.MarkerClassList(marker);
};

