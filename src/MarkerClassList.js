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
        if (this._marker._icon) {
            for (var className in this._classList) { // eslint-disable-line guard-for-in
                L.DomUtil.removeClass(this._marker._icon, className);
            }
        }
        this._classList = {};
    },
    toString: function() {
        if (Object.keys) {
            return Object.keys(this._classList).join(' ');
        }
        var classList = '';
        for (var i in this._classList) { // eslint-disable-line guard-for-in
            classList += i + ' ';
        }
        return classList;
    },
    _addClasses: function() {
        if (!this._marker._icon) {
            return;
        }
        for (var className in this._classList) { // eslint-disable-line guard-for-in
            L.DomUtil.addClass(this._marker._icon, className);
        }
    }
});

L.markerClassList = function(marker) {
    return new L.MarkerClassList(marker);
};

export default L.MarkerClassList;
