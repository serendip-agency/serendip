"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bodyParser = require("body-parser");
const http = require("http");
const Async = require("async");
const _1 = require(".");
const topoSort = require("toposort");
const ServerRouter_1 = require("./ServerRouter");
/**
 *  Will contain everything that we need from server
 */
class Server {
    // passing worker from Start.js 
    constructor(opts, worker, serverStartCallback) {
        var port = opts.port || parseInt(process.env.port);
        // Cluster worker
        Server.worker = worker;
        Server.middlewares = opts.middlewares || [];
        // adding basic middlewares to begging of middlewares array
        Server.middlewares.unshift(bodyParser.json());
        Server.middlewares.unshift(bodyParser.urlencoded({ extended: false }));
        Async.series([
            (cb) => this.addServices(opts.services).then(() => cb(null, null)).catch((e) => {
                if (serverStartCallback)
                    serverStartCallback(e);
                else
                    console.error(e);
            }),
            (cb) => this.addRoutes(opts.controllers).then(() => cb(null, null)).catch((e) => {
                if (serverStartCallback)
                    serverStartCallback(e);
                else
                    console.error(e);
            })
        ], () => {
            Server.httpServer = http.createServer(function (req, res) {
                req = _1.ServerRequestHelpers(req);
                res = _1.ServerResponseHelpers(res);
                ServerRouter_1.ServerRouter.routeIt(req, res);
            });
            Server.httpServer.listen(port, function () {
                console.log(`worker ${worker.id} running http server at port ${port}`);
                if (serverStartCallback)
                    serverStartCallback();
            });
            // Listen to port after configs done
        });
    }
    // usage : starting server from ./Start.js
    static bootstrap(opts, worker, serverStartCallback) {
        return new Server(opts, worker, serverStartCallback);
    }
    async addServices(servicesToRegister) {
        var servicesToStart = [];
        var dependenciesToSort = [];
        servicesToRegister.forEach((sv) => {
            if (!sv)
                return;
            if (sv.dependencies)
                sv.dependencies.forEach((val) => {
                    dependenciesToSort.push([sv.name, val]);
                });
            servicesToStart[sv.name] = sv;
        });
        var sortedDependencies = topoSort(dependenciesToSort).reverse();
        return new Promise((resolve, reject) => {
            function startService(index) {
                var serviceName = sortedDependencies[index];
                var serviceObject;
                try {
                    serviceObject = new servicesToStart[serviceName];
                }
                catch (_a) {
                    reject(`${serviceName} not imported in server start.`);
                }
                Server.services[serviceName] = serviceObject;
                if (!serviceObject.start)
                    startService(index + 1);
                else
                    serviceObject.start().then(() => {
                        //console.log(`☑ ${serviceName}`);
                        if (sortedDependencies.length > index + 1)
                            startService(index + 1);
                        else
                            resolve();
                    }).catch((err) => {
                        reject(err);
                    });
            }
            if (sortedDependencies.length > 0)
                startService(0);
        });
    }
    /**
    * Add controllers to express router
    * Notice : all controllers should end with 'Controller'
    * Notice : controller methods should start with requested method ex : get,post,put,delete
    */
    async addRoutes(controllersToRegister) {
        // iterating trough controller classes
        controllersToRegister.forEach(function (controller) {
            var objToRegister = new controller;
            // iterating trough controller endpoint in class
            Object.getOwnPropertyNames(objToRegister).forEach(function (controllerEndpointName) {
                var endpoint = objToRegister[controllerEndpointName];
                if (!endpoint)
                    return;
                if (!endpoint.method || !endpoint.actions)
                    return;
                // Defining controllerUrl for this controllerMethod
                var controllerUrl = `/api/${controller.name.replace('Controller', '')}/${controllerEndpointName}`;
                if (endpoint.route)
                    if (!endpoint.route.startsWith('/'))
                        endpoint.route = '/' + endpoint.route;
                var serverRoute = {
                    route: endpoint.route || controllerUrl,
                    method: endpoint.method,
                    publicAccess: endpoint.publicAccess || false,
                    endpoint: controllerEndpointName,
                    controllerName: controller.name,
                    controllerObject: objToRegister,
                };
                //console.log(`☑ [${serverRoute.method.toUpperCase()}] ${serverRoute.route} | ${serverRoute.controllerName} > ${serverRoute.endpoint}`);
                Server.routes.push(serverRoute);
            });
        });
    }
}
/**
 * routes which server router will respond to
 * and feel free to add your routes to it
 */
Server.routes = [];
Server.services = {};
exports.Server = Server;
