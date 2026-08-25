import { Hono } from "hono";
import destinations from "./handlers/destination-handlers";
import flights from "./handlers/flight-handlers";
import health from "./handlers/health-handlers";
import journeys from "./handlers/journey-handlers";
import lifecycle from "./handlers/lifecycle-handlers";
import operatorCatalog from "./handlers/operator-catalog-handlers";
import operatorReports from "./handlers/operator-reports-handlers";
import rooms from "./handlers/room-handlers";
import safety from "./handlers/safety-handlers";
import { createCorsMiddleware } from "./middleware/cors";
import { onErrorHandler } from "./middleware/error-handler";
import { requestId } from "./middleware/request-id";
import { createSecureHeadersMiddleware } from "./middleware/secure-headers";

export const App = new Hono<{ Bindings: Env }>();

App.use("*", requestId());
App.use("*", createSecureHeadersMiddleware());
App.onError(onErrorHandler);
App.use("*", createCorsMiddleware());

App.route("/health", health);
App.route("/flights", flights);
App.route("/destinations", destinations);
App.route("/journeys", journeys);
App.route("/internal/lifecycle", lifecycle);
App.route("/operator/catalog", operatorCatalog);
App.route("/operator/reports", operatorReports);
App.route("/rooms", rooms);
App.route("/safety", safety);
