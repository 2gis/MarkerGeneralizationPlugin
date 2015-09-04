L.WebWorkerHelper = {
    workerInit: function() {
        msgHandlers = {};
        options = {};
        registerMsgHandler = function(handlerName, handler) {
            msgHandlers[handlerName] = handler;
        };

        self.onmessage = function(event) {
            switch (event.data.type) {
                case 'init':
                    for (var i in event.data.options) {
                        var elem = event.data.options[i];
                        if (elem && elem.substr && elem.substr(0, 4) == 'blob') {
                            importScripts(elem);
                        } else {
                            options[i] = elem;
                        }
                    }
                default:
                    if (msgHandlers[event.data.type]) {
                        msgHandlers[event.data.type](event.data);
                    }
            }
        }
    },

    getMainFunc: function(func) {
        return URL.createObjectURL(new Blob([
            '(', this.workerInit.toString(), ')();',
            '(', func.toString(), ')();'
        ], {
            type: 'application/javascript'
        }));
    },

    getFunctionalParameter: function(func, paramName) {
        return URL.createObjectURL(new Blob([
            'options["' + paramName, '"] = ', func.toString()
        ], {
            type: 'application/javascript'
        }));
    },

    createWorker: function(mainFunc, options) {
        var worker = new Worker(this.getMainFunc(mainFunc));
        for (var i in options) {
            if (typeof options[i] == 'function') {
                options[i] = this.getFunctionalParameter(options[i], i);
            }
        }

        worker.postMessage({
            type: 'init',
            options: options
        });

        worker._messageListeners = {};
        worker.onmessage = function(e) {
            if (worker._messageListeners[e.data.type]) {
                worker._messageListeners[e.data.type](e.data);
            }
        };

        worker.registerMsgHandler = function(eventType, handler) {
            worker._messageListeners[eventType] = handler;
        };

        return worker;
    }
};
