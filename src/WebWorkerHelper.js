L.WebWorkerHelper = {
    workerInit: function() {
        msgHandlers = {};
        options = {};
        registerMsgHandler = function(handlerName, handler) {
            if (!msgHandlers[handlerName]) {
                msgHandlers[handlerName] = handler;
            }
        };

        dropMsgHandler = function(handlerName) {
            delete msgHandlers[handlerName];
        };

        send = function(message) {
            postMessage(JSON.stringify(message));
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
                    break;
                default:
                    var opts = JSON.parse(event.data.buf);
                    opts.type = event.data.type;
                    if (msgHandlers[event.data.type]) {
                        msgHandlers[event.data.type](opts);
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
            var data = JSON.parse(e.data);
            if (worker._messageListeners[data.type]) {
                worker._messageListeners[data.type](data);
            }
        };

        worker._queue = [];

        worker.registerMsgHandler = function(eventType, handler) {
            if (!worker._messageListeners[eventType]) {
                worker._messageListeners[eventType] = handler;
            }
        };

        worker.dropMsgHandler = function(eventType) {
            delete worker._messageListeners[eventType];
        };

        worker.send = function(msgName, content) {
            setTimeout(function() {
                var arrbuf = JSON.stringify(content);
                worker.postMessage({
                    type: msgName,
                    buf: arrbuf
                });
            }, 0);
        };

        return worker;
    }
};
